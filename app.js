function ngDumpScopes() {
  angular.forEach($('.ng-scope'), function(o) { console.log("Scope ID:", angular.element(o).scope().$id, o, angular.element(o).scope()); });
};

var PlanboxPMApp = angular.module('PlanboxPMApp', ['ngSanitize','ngCookies','tb.ngUtils'])
    .constant('PlanboxProductId', '6887')
    .constant('PlanboxPMProjectId', '10467')
    .service('StoryProvider', function($http, $q, PlanboxProductId, PlanboxPMProjectId) {
      this.loadUser = function() {
        return $http.jsonp('http://www.planbox.com/api/get_logged_resource?callback=JSON_CALLBACK');
      };
      this.loadStories = function() {
        var getCurrent = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=current&callback=JSON_CALLBACK');
        var getBacklog = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=backlog&callback=JSON_CALLBACK');
        return $q.all({ current: getCurrent, backlog: getBacklog }).then(function(all) {
          return _.union(all.current.data.content, all.backlog.data.content);
        });
      };
    })
    .controller('PMAppController', function($http, $scope, $sanitize, $q, StoryProvider, PlanboxProductId, PlanboxPMProjectId, $TBUtils) {
      $scope.mode             = 'prioritize';
      $scope.pbUser           = {};
      $scope.allPmStoriesById = {};

      StoryProvider.loadUser().then(function(resp) { $scope.pbUser = resp.data.content });
      StoryProvider.loadStories().then(function(allStories) {
//window.allStories = allStories = allStories.slice(0,75);

        // decorate planbox stories (and tasks)
        decorateList(allStories, pbStoryDecorator);
        _.each(allStories, function(story) {
          decorateList(story.tasks, pbStoryTaskDecorator);
        });

        // construct "pm" wrapped stories and also categorize across prioritized/unprioritized
        _.each(allStories, function(pbStory) {
          var pmStory = {
            name: pbStory.name,
            pbStory   : pbStory,
            pmInfo    : pbStory.extractPmInfo(),
            doStories : []
          };
          decorateObject(pmStory, pmStoryDecorator);

          $scope.allPmStoriesById[pmStory.pbStory.id] = pmStory;
        });
        console.log('Example story:', _.sample($scope.allPmStoriesById, 1));

        // EPICS: thread together items by pm_master_id
        _.chain($scope.allPmStoriesById)
          .filter(function(pmStory) { return pmStory.pmInfo.pm_master_id })
          .each(function(pmStory) {
            $scope.allPmStoriesById[pmStory.pmInfo.pm_master_id].doStories.push(pmStory);
          })
        ;
      });
    })
    .controller('PMPrioritizeController', function($scope, $cookieStore) {
      $cookieStore.getWithDefault = function(key, defaultValue) {
          var val = $cookieStore.get(key);
          if (typeof val === 'undefined') return defaultValue;
          return val;
      };
      $scope.stories           = [];
      $scope.scoreFilterMode   = $cookieStore.getWithDefault('PMPrioritizeController_scoreFilterMode',   'unscored_only');
      $scope.roadmapFilterMode = $cookieStore.getWithDefault('PMPrioritizeController_roadmapFilterMode', 'all');
      function saveUXInCookies() {
          $cookieStore.put('PMPrioritizeController_scoreFilterMode',    $scope.scoreFilterMode);
          $cookieStore.put('PMPrioritizeController_roadmapFilterMode',  $scope.roadmapFilterMode);

          _.each($scope.unionStoryFilters, function(o) {
              var cookieName = 'PMPrioritizeController_unionStoryFilter_' + o.name;
              $cookieStore.put(cookieName, o.enabled);
          });
      };

      $scope.unionStoryFilters = [
        {
          name: 'Priorities',
          enabled: $cookieStore.getWithDefault('PMPrioritizeController_unionStoryFilter_Priorities', false),
          priorityStatus: 'priority',
          glyphicon: 'glyphicon-play'
        },
        {
          name: 'Incidentals',
          enabled: $cookieStore.getWithDefault('PMPrioritizeController_unionStoryFilter_Incidentals', true),
          priorityStatus: 'unprioritized_incidental',
          glyphicon: 'glyphicon-asterisk'
        },
        {
          name: 'Backlog',
          enabled: $cookieStore.getWithDefault('PMPrioritizeController_unionStoryFilter_Backlog', true),
          priorityStatus: 'unprioritized_backlog',
          glyphicon: 'glyphicon-th-list'
        }
      ];
      $scope.handleClickedOnScoreFilterMode = function(clickedMode) {
        if ($scope.scoreFilterMode === clickedMode)
        {
          $scope.scoreFilterMode = 'any';
        }
        else
        {
          $scope.scoreFilterMode = clickedMode;
        }
      };
      $scope.handleClickedOnRoadmapFilterMode = function(clickedMode) {
          $scope.roadmapFilterMode = ($scope.roadmapFilterMode !== 'all') ? 'all' : 'roadmap_only';
      };

      // filters allPmStoriesById vs scope filters and stuff into $scope.stories
      function filterStories() {
        var allowedPriorityStatuses = _.chain($scope.unionStoryFilters)
                                     .filter('enabled')
                                     .pluck('priorityStatus')
                                     .value()
                                     ;

        var matches = [];

        // remove completed tasks
        matches = _.filter($scope.allPmStoriesById, function(story) { return story.pbStory.hasMoreTasks() });
        
        matches = _.filter(matches, function(story) {
          return _.indexOf(allowedPriorityStatuses, story.priorityStatus()) !== -1;
        });

        switch ($scope.scoreFilterMode) {
          case 'any':
            break;
          case 'scored_only':
            matches = _.filter(matches, function(o) { return o.hasPmScore() });
            break;
          case 'unscored_only':
            matches = _.filter(matches, function(o) { return !o.hasPmScore() });
            break;
        }

        if ($scope.roadmapFilterMode !== 'all')
        {
            matches = _.filter(matches, function(o) { return o.pbStory.isRoadmapItem() });
        }

        $scope.stories = matches;

        return matches;
      }

      function updateStories(newVal, oldVal) {
        if (newVal === oldVal) return;
        filterStories();
      }

      $scope.$watchCollection('allPmStoriesById', updateStories);
      $scope.$watch('[unionStoryFilters,scoreFilterMode,roadmapFilterMode]', function() {
          saveUXInCookies();
          filterStories();
      }, true);
    })
    .controller('PMPrioritizeListItemController', function($http, $scope, $TBUtils) {
      $scope.showStoryDetails = false;
      $scope.selectOptions = {
        // todo: is this the best place for this data? config?
        // 1 is always "most attractive to do"
        'pm_revenue' : { '': '-', '1': '$$$$', '2': '$$$', '3': '$$', '4': '$' },
        'pm_time'    : { '': '-', '1': '<= 1 day', '2': '<= 1 week', '3': '<= 1 month', '4': '> 1 month' },
        'pm_fit'     : { '': '-', '1': 'Strongly Consistent', '2': 'Consistent', '3': 'Not Consistent', '4': 'Terrible Hack' },
        'pm_risk'    : { '': '-', '1': 'Sure thing', '2': 'A little tricky', '3': 'A lot tricky', '4': 'Your guess is as good as mine' }
      };

      function updateTimeframe(pbStory) {
        $http.jsonp('http://www.planbox.com/api/move_story_to_iteration?callback=JSON_CALLBACK&' + $.param({
              'story_id'  : pbStory.id,
              'timeframe' : pbStory.timeframe,
              'position'  : 'top'
              }))
             .success(function() { console.log('updated!') })
             .error(function() { alert('could not save data, refresh and try again') })
      }

      $scope.prioritize = function() {
        var pbStory = this.story.pbStory;
        pbStory.timeframe = 'current';
        this.story.makePmMaster();
        updateTimeframe(pbStory);
      };
      $scope.deprioritize = function() {
        var pbStory = this.story.pbStory;
        pbStory.timeframe = 'backlog';
        updateTimeframe(pbStory);
      };

      $scope.saveStory = function() {
        var updatedStory = $scope.story;
        pbPmTagify(updatedStory);
        $http.jsonp('http://www.planbox.com/api/update_story?callback=JSON_CALLBACK&' + $.param({
          'story_id' : updatedStory.pbStory.id,
          'name'     : updatedStory.pbStory.name,
          'tags'     : updatedStory.pbStory.tags
        }))
        .success(function() { console.log('updated!') })
        .error(function() { alert('could not save data, refresh and try again') })
        ;
      };

      $TBUtils.createComputedProperty($scope, 'story.pmInfo.weightedPm', '[story.pmInfo.pm_revenue,story.pmInfo.pm_time,story.pmInfo.pm_fit,story.pmInfo.pm_risk]', function(scope) {
        if (!(scope.story.pmInfo.pm_revenue && scope.story.pmInfo.pm_time && scope.story.pmInfo.pm_fit)) return 0;

        return Math.pow(10,4-parseInt(scope.story.pmInfo.pm_revenue,10)) * Math.pow(5, 4-parseInt(scope.story.pmInfo.pm_fit,10)) / Math.pow(10, parseInt(scope.story.pmInfo.pm_time,10));
      });

      $TBUtils.createComputedProperty($scope, 'story.storyTags', 'story.pbStory.tags', function(scope) {
        return rejectPmTags(scope.story.pbStory.tags);
      });

      $scope.$watch('story.pmInfo', function(updatedStory, oldStory, scope) {
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
        scope.saveStory();
        console.log('story changed: ', oldStory, updatedStory, getChanges(oldStory, updatedStory));

      }, true);
    })
    .controller('PMManageController', function($scope) {
      $scope.maxProgressBarWidth = 400;
      $scope.priorities = [];
      function updatePriorities() {
        $scope.priorities = _.filter($scope.allPmStoriesById, function(o) { return o.priorityStatus() === 'priority' });
      };
      $scope.$watchCollection('allPmStoriesById', function() {
        updatePriorities();
      });
      $scope.$watch('mode', updatePriorities);
    })
    ;

// DECORATORS
var pbStoryDecorator = {
  decoratorName       : 'pbStoryDecorator',
  isRelatedToPmMaster : function(pm_master_id) { return this.tags && this.tags.indexOf('pm_master_id_'+pm_master_id) !== -1 },
  isRoadmapItem       : function() { return this.tags && this.tags.indexOf('roadmap') !== -1 },
  progressPercent     : function() { return 100 * this.duration() / this.estimate() },
  estimate            : function() { return _.reduce(this.tasks, function(sum, task) { return sum + task.estimate }, 0) },
  // pending, inprogress, completed, delivered (verified in UI), accepted, rejected, released or blocked
  hasMoreTasks        : function() { return this.status === 'pending'|| this.status === 'inprogress' },
  duration: function() {
    return _.reduce(this.tasks, function(sum, task) {
      return sum + task.progressInHours();
    }, 0);
  },
  remaining: function() {
    return this.estimate() - this.duration();
  },
  extractPmInfo: function() {
    var pmInfo = {
      pm_revenue   : '',
      pm_fit       : '',
      pm_time      : '',
      pm_risk      : '',
      pm_master_id : ''
    };
    this.tags = this.tags || '';
    _.each(this.tags.split(','), function(tag) {
      _.each(pmInfo, function(val, pmTag) {
        var mm = null;
        var regex = new RegExp("^"+pmTag+"_([0-9]+)");
        if (mm = tag.match(regex))
        {
          pmInfo[pmTag] = mm[1];
        }
      });
    });
    return pmInfo;
  }
};
var pbStoryTaskDecorator = {
  decoratorName   : 'pbStoryTaskDecorator',
  progressInHours : function() {
    var durationHours = 0;
    switch (this.status) {
      case 'completed':
        durationHours = this.duration;
        break;
      case 'pending':
      default:
        durationHours = (this.timer_sum/3600);
        break;
    }
    return durationHours;
  }
};
function genDoStorySummer(f) {
  return function() {
    return _.reduce(this.doStories, function(sum, story) {
      return sum + story.pbStory[f]()
    }, 0);
  };
};
var pmStoryDecorator = {
  decoratorName   : 'pmStoryDecorator',
  estimate        : genDoStorySummer('estimate'),
  duration        : genDoStorySummer('duration'),
  remaining       : genDoStorySummer('remaining'),
  progressPercent : function() { return 100 * this.duration() / this.estimate() },
  hasPmScore: function() { return _.all([this.pmInfo.pm_revenue, this.pmInfo.pm_fit, this.pmInfo.pm_time, this.pmInfo.pm_risk]) },
  isPmMaster: function() { return this.pmInfo.pm_master_id && this.pbStory.id == this.pmInfo.pm_master_id },
  makePmMaster: function() {
    if (!this.pmInfo.pm_master_id)
    {
      this.pmInfo.pm_master_id = this.pbStory.id+"";  // string cast
    }
  },
  glyphicon: function() {
    switch (this.priorityStatus()) {
      case 'priority':
        return 'glyphicon-play';
        break;
      case 'unprioritized_incidental':
        return 'glyphicon-asterisk';
        break;
      case 'unprioritized_backlog':
        return 'glyphicon-list';
        break;
    }
  },
  priorityStatus: function() {
    if (this.pbStory.timeframe === 'current' && this.isPmMaster())
    {
      return 'priority';
    }
    else if (this.pbStory.timeframe === 'current' && this.pmInfo.pm_master_id)
    {
      // no-op this is a story linked to an existing "pm master"
      return 'na';
    }
    else if (this.pbStory.timeframe === 'current' && !this.pmInfo.pm_master_id)
    {
      return 'unprioritized_incidental';
    }
    else if (this.pbStory.timeframe === 'backlog')
    {
      return 'unprioritized_backlog';
    }
    else
    {
      console.log('unhandled pmStory setup...', this);
      throw Error("Unexpected story type....");
    }
  }
};

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

  var pmInfo = [ 'pm_time', 'pm_risk', 'pm_revenue', 'pm_fit', 'pm_master_id' ];
  _.each(pmInfo, function(pmTag) {
    if (typeof story.pmInfo[pmTag] !== 'undefined' && story.pmInfo[pmTag])
    {
      tags.push(pmTag + '_' + story.pmInfo[pmTag]);
    }
  });

  story.pbStory.tags = tags.join(',');
}

function decorateObject(o, decorator) {
  if (!decorator.decoratorName) throw Error("Decorators must be named");
  if (o.decoratorName) throw Error("Only one decorator allowed presently.");

  _.extend(o, decorator);
  //console.log('decorate: ', decorator.decoratorName);
}

// should this scope.watchCollection and auto re-run?
function decorateList(list, decorator) {
  _.chain(list)
    // make decoration idempotent
    .filter(function(o) { return (typeof o.decoratorName === 'undefined') })
    .each(function(o) {
      decorateObject(o, decorator);
    })
    ;
}

