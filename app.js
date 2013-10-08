function ngDumpScopes() {
  angular.forEach($('.ng-scope'), function(o) { console.log("Scope ID:", angular.element(o).scope().$id, o, angular.element(o).scope()); });
};

var PlanboxPMApp = angular.module('PlanboxPMApp', ['ngSanitize','tb.ngUtils'])
    .constant('PlanboxProductId', '6887')
    .constant('PlanboxPMProjectId', '10467')
    .service('StoryProvider', function($http, $q, PlanboxProductId, PlanboxPMProjectId) {
      // todo: loadStories should retunr a promise and the scope shit should be in the caller
      this.loadStories = function(scope, propName) {
        var getCurrent = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=current&callback=JSON_CALLBACK');
        var getBacklog = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=backlog&callback=JSON_CALLBACK');
        $q.all({ current: getCurrent, backlog: getBacklog }).then(function(all) {
          data = _.union(all.current.data.content, all.backlog.data.content);

          // project_id filter doesn't seem to work
          var pbData = _.filter(data, function (o) { return o.project_id == PlanboxPMProjectId } );

          // dev - faster to work with less data
          pbData = pbData.slice(0, 5);

          var pmStories = [];
          _.each(pbData, function(o) {
            var pmInfo = {};
            o.tags = o.tags || '';
            _.each(o.tags.split(','), function(tag) {
              var pmInfoLabels = [ 'pm_time', 'pm_risk', 'pm_revenue', 'pm_fit' ];
              _.each(pmInfoLabels, function(pmTag) {
                var mm = null;
                var regex = new RegExp("^"+pmTag+"_([0-9])");
                if (mm = tag.match(regex))
                {
                    pmInfo[pmTag] = mm[1];
                }
              });
            });
            pmStories.push( {
              pbStory: o,
              pmInfo: pmInfo
            });
          });

          console.log('Example story:', pmStories[0]);
          scope[propName] = pmStories;
        });
      };
    })
    .controller('PMListController', function($http, $scope, $sanitize, $q, StoryProvider, PlanboxProductId, PlanboxPMProjectId) {
      $scope.pmStories = [];
      StoryProvider.loadStories($scope, 'pmStories');
    })
    .controller('PMItemController', function($http, $scope, $TBUtils) {
      $scope.selectOptions = {
        // todo: is this the best place for this data? config?
        // 1 is always "most attractive to do"
        'pm_revenue' : { '': '?', '1': '$$$$', '2': '$$$', '3': '$$', '4': '$' },
        'pm_time'    : { '': '?', '1': '<= 1 day', '2': '<= 1 week', '3': '<= 1 month', '4': '> 1 month' },
        'pm_fit'     : { '': '?', '1': 'Strongly Consistent', '2': 'Consistent', '3': 'Not Consistent', '4': 'Terrible Hack' },
        'pm_risk'    : { '': '?', '1': 'Sure thing', '2': 'Not too bad', '3': 'I can figure it out', '4': 'What could possibly go wrong?' }
      };

      function updateTimeframe(pbStory) {
        $http.post('http://www.planbox.com/api/move_story_to_iteration',
            $.param({
              'story_id'  : pbStory.id,
              'timeframe' : pbStory.timeframe,
              'position'  : 'top'
            }),
            {
              'headers': {'Content-Type': 'application/x-www-form-urlencoded'}
            })
             .success(function() { console.log('updated!') })
             .error(function() { alert('could not save data, refresh and try again') })
      }

      $scope.prioritize = function() {
        var pbStory = this.story.pbStory;
        pbStory.timeframe = 'current';
        updateTimeframe(pbStory);
      };
      $scope.deprioritize = function() {
        var pbStory = this.story.pbStory;
        pbStory.timeframe = 'backlog';
        updateTimeframe(pbStory);
      };

      $TBUtils.createComputedProperty($scope, 'story.pmInfo.weightedPm', '[story.pmInfo.pm_revenue,story.pmInfo.pm_time,story.pmInfo.pm_fit,story.pmInfo.pm_risk]', function(scope) {
        if (!(scope.story.pmInfo.pm_revenue && scope.story.pmInfo.pm_time && scope.story.pmInfo.pm_fit)) return -1;

        return Math.pow(10,4-parseInt(scope.story.pmInfo.pm_revenue,10)) * Math.pow(5, 4-parseInt(scope.story.pmInfo.pm_fit,10)) / Math.pow(10, parseInt(scope.story.pmInfo.pm_time,10));
      });

      $TBUtils.createComputedProperty($scope, 'story.storyTags', 'story.pbStory.tags', function($scope) {
        return rejectPmTags($scope.story.pbStory.tags);
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
              'story_id' : updatedStory.pbStory.id,
              'name'     : updatedStory.pbStory.name,
              'tags'     : updatedStory.pbStory.tags
            }),
            {
              'headers': {'Content-Type': 'application/x-www-form-urlencoded'}
            })
             .success(function() { console.log('updated!') })
             .error(function() { alert('could not save data, refresh and try again') })
      }, true);
    });

function rejectPmTags(tags) {
  var isString = (typeof tags === 'string');

  if (isString)
  {
    tags = tags.split(',');
  }

  tags = _.reject(tags, function(tag) {
    var regex = new RegExp("^pm_.*");
    return tag.match(regex);
  });

  if (isString)
  {
    tags = tags.join(',');
  }

  return tags;
}

function pbPmTagify(story) {
  var tags = story.pbStory.tags || '';

  // clear existing pm_* tags
  tags = rejectPmTags(tags.split(','));

  var pmInfo = [ 'pm_time', 'pm_risk', 'pm_revenue', 'pm_fit' ];
  _.each(pmInfo, function(pmTag) {
    if (typeof story.pmInfo[pmTag] !== 'undefined' && story.pmInfo[pmTag])
    {
      tags.push(pmTag + '_' + story.pmInfo[pmTag]);
    }
  });

  story.pbStory.tags = tags.join(',');
}

