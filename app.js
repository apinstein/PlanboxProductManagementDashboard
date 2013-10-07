function ngDumpScopes() {
  angular.forEach($('.ng-scope'), function(o) { console.log("Scope ID:", angular.element(o).scope().$id, o, angular.element(o).scope()); });
};

var PlanboxPMApp = angular.module('PlanboxPMApp', ['ngSanitize','tb.ngUtils'])
    .constant('PlanboxProductId', '6887')
    .constant('PlanboxPMProjectId', '10467')
    .controller('PMListController', function($http, $scope, $sanitize, PlanboxProductId, PlanboxPMProjectId) {
      $scope.pmStories = [];

      $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=backlog&callback=JSON_CALLBACK').success(function(data) {
        // project_id filter doesn't seem to work
        var pmStories = _.filter(data.content, function (o) { return o.project_id == PlanboxPMProjectId } );
        //pmStories = pmStories.slice(0, 2);
        console.log('Example story:', pmStories[0]);

        _.each(pmStories, function(o) {
          o.tags = o.tags || '';
          _.each(o.tags.split(','), function(tag) {
            var pmInfo = [ 'pm_time', 'pm_risk', 'pm_revenue', 'pm_fit' ];
            _.each(pmInfo, function(pmTag) {
              var mm = null;
              var regex = new RegExp("^"+pmTag+"_([0-9])");
              if (mm = tag.match(regex))
              {
                  o[pmTag] = mm[1];
              }
            });
          });
        });

        // ignore stories w/o pm tags
        //pmStories = _.filter(pmStories, function(o) { return typeof o.pm_revenue !== 'undefined' });
        $scope.pmStories = pmStories;
      });
    })
    .controller('PMItemController', function($http, $scope, $TBUtils) {
      $scope.selectOptions = {
        // todo: is this the best place for this data? config?
        // 1 is always "most attractive to do"
        'pm_revenue' : { '': 'n/a', '1': '$$$$', '2': '$$$', '3': '$$', '4': '$' },
        'pm_time'    : { '': 'n/a', '1': '<= 1 day', '2': '<= 1 week', '3': '<= 1 month', '4': '> 1 month' },
        'pm_fit'     : { '': 'n/a', '1': 'Strongly Consistent', '2': 'Consistent', '3': 'Not Consistent', '4': 'Terrible Hack' },
        'pm_risk'    : { '': 'n/a', '1': 'Sure thing', '2': 'Not too bad', '3': 'I can figure it out', '4': 'What could possibly go wrong?' }
      };

      $TBUtils.createComputedProperty($scope, 'story.weightedPm', '[story.pm_revenue,story.pm_time,story.pm_fit,story.pm_risk]', function($scope) {
        if (!($scope.story.pm_revenue && $scope.story.pm_time && $scope.story.pm_fit)) return 0;

        return Math.pow(10,4-parseInt($scope.story.pm_revenue,10)) * Math.pow(5, 4-parseInt($scope.story.pm_fit,10)) / Math.pow(10, parseInt($scope.story.pm_time,10));
      });

      $scope.$watch('story', function(updatedStory, oldStory, $scope) {
        // wtf? but ok...
        if (oldStory === updatedStory) return;

        function getChanges(prev, now) {
          var changes = {};
          for (var prop in now) {
            if (!prev || prev[prop] !== now[prop]) {
              if (typeof now[prop] == "object") {
                var c = getChanges(prev[prop], now[prop]);
                if (! _.isEmpty(c) ) // underscore
                  changes[prop] = c;
              } else {
                changes[prop] = now[prop];
              }
            }
          }
          return changes;
        }
        console.log('story changed: ', oldStory, updatedStory, getChanges(oldStory, updatedStory));

        pbPmTagify(updatedStory);
        $http.post('http://www.planbox.com/api/update_story',
            $.param({
              'story_id' : updatedStory.id,
              'name'     : updatedStory.name,
              'tags'     : updatedStory.tags
            }),
            {
              'headers': {'Content-Type': 'application/x-www-form-urlencoded'}
            })
             .success(function() { console.log('udpated!') })
             .error(function() { alert('could not save data, refresh and try again') })
      }, true);
    });

function pbPmTagify(story) {
  var tags = story.tags || '';
  tags = tags.split(',');

  // clear existing pm_* tags
  tags = _.reject(tags, function(tag) {
    var regex = new RegExp("^pm_.*");
    return tag.match(regex);
  });

  var pmInfo = [ 'pm_time', 'pm_risk', 'pm_revenue', 'pm_fit' ];
  _.each(pmInfo, function(pmTag) {
    if (typeof story[pmTag] !== 'undefined' && story[pmTag])
    {
      tags.push(pmTag + '_' + story[pmTag]);
    }
  });

  story.tags = tags.join(',');
}

