// vim: ts=2 sw=2 :
var PlanboxPMApp = angular.module('PlanboxPMApp', ['ngSanitize'])
    .constant('PlanboxProductId', '6887')
    .constant('PlanboxPMProjectId', '10467')
    .controller('PMListController', function($http, $scope, $sanitize, PlanboxProductId, PlanboxPMProjectId) {
      $scope.selectOptions = {
        // 1 is always "most attractive to do"
        'pm_revenue' : { '': 'n/a', '1': '$$$$', '2': '$$$', '3': '$$', '4': '$' },
        'pm_time'    : { '': 'n/a', '1': '<= 1 day', '2': '<= 1 week', '3': '<= 1 month', '4': '> 1 month' },
        'pm_fit'     : { '': 'n/a', '1': 'Strongly Consistent', '2': 'Consistent', '3': 'Not Consistent', '4': 'Terrible Hack' },
        'pm_risk'    : { '': 'n/a', '1': 'Sure thing', '2': 'Not too bad', '3': 'I can figure it out', '4': 'What could possibly go wrong?' }
      };
      $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=backlog&callback=JSON_CALLBACK').success(function(data) {
        // project_id filter doesn't seem to work
        var pmStories = _.filter(data.content, function (o) { return o.project_id == PlanboxPMProjectId } );
    pmStories = pmStories.slice(0, 10);

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

      $scope.$watch('pmStories', function(newStory, oldStory) {
        if (typeof newStory === 'undefined' || !newStory.length) return;

        var updatedStory = newStory[0];
        //console.log(updatedStory);

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

