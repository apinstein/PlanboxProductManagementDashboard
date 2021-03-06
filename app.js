// vim: ts=2 sw=2 :
function ngDumpScopes() {
  angular.forEach($('.ng-scope'), function(o) { console.log("Scope ID:", angular.element(o).scope().$id, o, angular.element(o).scope()); });
};

var PlanboxPMApp = angular.module('PlanboxPMApp', ['ngSanitize','ngCookies','tb.ngUtils','dragAndDrop'])
    .service('StoryProvider', function($http, $q) {
      this.loadUser = function() {
        return $http.jsonp('http://www.planbox.com/api/get_logged_resource?callback=JSON_CALLBACK');
      };
      this.loadProducts = function() {
        return $http.jsonp('http://www.planbox.com/api/get_products?callback=JSON_CALLBACK');
      };
      this.loadStories = function(PlanboxProductId) {
        var getCurrent = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=current&callback=JSON_CALLBACK');
        var getBacklog = $http.jsonp('https://www.planbox.com/api/get_stories?product_id=' + PlanboxProductId + '&timeframe=backlog&callback=JSON_CALLBACK');
        return $q.all({ current: getCurrent, backlog: getBacklog }).then(function(all) {
          return _.union(all.current.data.content, all.backlog.data.content);
        });
      };
      this.saveStory = function(story) {
        pbPmTagify(story);
        $http.jsonp('http://www.planbox.com/api/update_story?callback=JSON_CALLBACK&' + $.param({
          'story_id' : story.pbStory.id,
          'name'     : story.pbStory.name,
          'tags'     : story.pbStory.tags
        }))
        .success(function() {
          console.log('successfully saved:', story.pbStory.id, story.pbStory.name);
        })
        .error(function() {
          console.log('error saving:', story.pbStory.id, story.pbStory.name);
          alert('could not save data, refresh and try again')
        })
        ;
      }

    })
    .controller('PMAppController', function($http, $scope, $sanitize, $q, StoryProvider, $TBUtils, $cookieStore) {
      $scope.pbUser              = {};
      $scope.pbProducts          = [];
      $scope.selectedPbProductId = getValueFromCookiesWithDefault($cookieStore, 'PMAppController_selectedPbProductId', null);
      $scope.mode                = getValueFromCookiesWithDefault($cookieStore, 'PMAppController_mode', 'prioritize');
      $scope.allPmStoriesById    = {};

      function goToProductId() {
          $scope.allPmStoriesById = {};

          StoryProvider.loadStories($scope.selectedPbProductId).then(function(allStories) {
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
            var proxyMasterMap = {};
            _.chain($scope.allPmStoriesById)
              .filter(function(pmStory) { return pmStory.pmInfo.pm_master_id })
              .each(function(pmStory) {
                try {
                  // make sure "self" doStory is FIRST
                  if (pmStory.pmInfo.pm_master_id == pmStory.pbStory.id) // 'self'
                  {
                    $scope.allPmStoriesById[pmStory.pmInfo.pm_master_id].doStories.unshift(pmStory);
                  }
                  else
                  {
                    $scope.allPmStoriesById[pmStory.pmInfo.pm_master_id].doStories.push(pmStory);
                  }
                } catch(e) {
                  console.log("Couldn't find master story in allPmStoriesById, likely due to iteration rollover...", pmStory.name, pmStory);
                  //var proxyMasterId = pmStory.pbStory.id;
                  //proxyMasterMap[pmStory.pmInfo.pm_master_id] = proxyMasterId;
                  //$scope.allPmStoriesById[proxyMasterId];
                }
              })
            ;
          });
      }
      $scope.$watch('selectedPbProductId', function(oldVal, newVal, scope) {
          $cookieStore.put('PMAppController_selectedPbProductId', $scope.selectedPbProductId);
          goToProductId();
      });
      $scope.$watch('mode', function() {
          $cookieStore.put('PMAppController_mode', $scope.mode);
      });

      // load user/products
      StoryProvider.loadUser().then(function(resp) { $scope.pbUser = resp.data.content });
      StoryProvider.loadProducts().then(function(resp) {
          $scope.pbProducts = resp.data.content;

          // ensure selection
          if (!_.any($scope.pbProducts, function(o) { return o.id === $scope.selectedPbProductId }))
          {
              $scope.selectedPbProductId = $scope.pbProducts[0].id;
          }

          goToProductId();
      });

    })
    .controller('PMPrioritizeController', function($scope, $cookieStore) {
      $scope.pmInfo            = pmInfo;
      $scope.stories           = [];
      $scope.scoreFilterMode   = getValueFromCookiesWithDefault($cookieStore, 'PMPrioritizeController_scoreFilterMode',   'unscored_only');
      $scope.roadmapFilterMode = getValueFromCookiesWithDefault($cookieStore, 'PMPrioritizeController_roadmapFilterMode', 'all');
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
          enabled: getValueFromCookiesWithDefault($cookieStore, 'PMPrioritizeController_unionStoryFilter_Priorities', false),
          priorityStatus: 'priority',
          glyphicon: 'glyphicon-play'
        },
        {
          name: 'Incidentals',
          enabled: getValueFromCookiesWithDefault($cookieStore, 'PMPrioritizeController_unionStoryFilter_Incidentals', true),
          priorityStatus: 'unprioritized_incidental',
          glyphicon: 'glyphicon-asterisk'
        },
        {
          name: 'Backlog',
          enabled: getValueFromCookiesWithDefault($cookieStore, 'PMPrioritizeController_unionStoryFilter_Backlog', true),
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
    .controller('PMPrioritizeListItemController', function($http, $scope, $TBUtils, StoryProvider) {
      $scope.showStoryDetails = false;
      $scope.selectOptions = {
        'pm_revenue' : pmInfo.pm_revenue.options,
        'pm_time'    : pmInfo.pm_time.options,
        'pm_fit'     : pmInfo.pm_fit.options,
        'pm_risk'    : pmInfo.pm_risk.options
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

      $scope.makeSubtaskOfPMMaster = function(doStory, el) {
        var oldPmMasterId = doStory.pmInfo.pm_master_id;

        // switch the pm_master_id to "this"
        doStory.pmInfo.pm_master_id = $scope.story.pmInfo.pm_master_id;
        StoryProvider.saveStory(doStory);

        // move the doStory from old master to new master
        _.pull($scope.allPmStoriesById[oldPmMasterId].doStories, doStory);
        $scope.story.doStories.push(doStory);

        $scope.updatePriorities();
      };

      $TBUtils.createComputedProperty($scope, 'story.pmInfo.weightedPm', '[story.pmInfo.pm_revenue,story.pmInfo.pm_time,story.pmInfo.pm_fit,story.pmInfo.pm_risk]', function(scope) {
        return scope.story.pmScore();
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
        console.log('story changed: ', oldStory, updatedStory, getChanges(oldStory, updatedStory));
        StoryProvider.saveStory($scope.story);

      }, true);
    })
    .controller('PMManageController', function($scope, StoryProvider) {
      $scope.maxProgressBarWidth = 400;
      $scope.priorities = [];
      $scope.updatePriorities = function() {
        $scope.priorities = _.filter($scope.allPmStoriesById, function(o) { return o.priorityStatus() === 'priority' });
      };
      $scope.dndMakeOwnPMMaster = function(doStory, el) {
        if (doStory.isPmMaster())
        {
          // no-op
          return;
        }

        var oldPmMasterId = doStory.pmInfo.pm_master_id;

        // switch the pm_master_id to "self"
        doStory.pmInfo.pm_master_id = doStory.pbStory.id;
        StoryProvider.saveStory(doStory);

        // move the doStory from old master to new master
        _.pull($scope.allPmStoriesById[oldPmMasterId].doStories, doStory);

        $scope.updatePriorities();
      };
      $scope.$watchCollection('allPmStoriesById', function() {
        $scope.updatePriorities();
      });
      $scope.$watch('mode', $scope.updatePriorities);
    })
    ;

function getValueFromCookiesWithDefault($cookieStore, key, defaultValue) {
  var val = $cookieStore.get(key);
  if (typeof val === 'undefined') return defaultValue;
  return val;
};
// PM INFO 
var pmInfo = {
    // 1 is always "most attractive to do"
    "pm_revenue": {
        "description": "Marginal Revenue or Cost Savings",
        "options": { 
            '': '-', 
            '1': '$$$$', 
            '2': '$$$', 
            '3': '$$', 
            '4': '$' 
        },
        "scores": {
            "1": 500000,
            "2": 100000,
            "3":  50000,
            "4":  10000
        }
    },
    "pm_time": {
        "description": "Man hours",
        "options": { 
            '': '-', 
            '1': '<= 1 day', 
            '2': '<= 1 week', 
            '3': '<= 1 month', 
            '4': '> 1 month' 
        },
        "scores": {
            "1": 4,
            "2": 30,
            "3": 100,
            "4": 300
        }
    },
    "pm_fit": {
        "description": "Strategic Fit",
        "options": { 
            '': '-', 
            '1': 'Strongly Consistent', 
            '2': 'Consistent', 
            '3': 'Not Consistent', 
            '4': 'Terrible Hack' 
        },
        // value multiplier
        "scores": {
            "1": 4.0,
            "2": 2.0,
            "3": 1.0,
            "4": 0.5
        }
    },
    "pm_risk": {
        "description": "Risk Discount",
        "options": { 
            '': '-', 
            '1': 'Sure thing', 
            '2': 'A little tricky', 
            '3': 'A lot tricky', 
            '4': 'Your guess is as good as mine' 
        },
        // value discount
        "scores": {
            "1": 1.0,
            "2": 0.95,
            "3": 0.75,
            "4": 0.5
        }
    }
};

// DECORATORS
var pbStoryDecorator = {
  decoratorName       : 'pbStoryDecorator',
  isRelatedToPmMaster : function(pm_master_id) { return this.tags && this.tags.indexOf('pm_master_id_'+pm_master_id) !== -1 },
  isRoadmapItem       : function() { return this.tags && this.tags.indexOf('roadmap') !== -1 },
  linkToPlanbox       : function() { return 'https://www.planbox.com/stories/' + this.id },
  progressPercent     : function() {
      if (!this.hasMoreTasks()) return 100; // prevents NaN from below

      return 100 * this.duration() / this.estimate()
  },
  estimate            : function() {
      // if story is completed; then estimate = duration.
      if (!this.hasMoreTasks())
      {
          return this.duration();
      }
      else
      {
          return _.reduce(this.tasks, function(sum, task) {
              return sum + task.estimate;
          }, 0)
      }
  },
  // pending, inprogress, completed, delivered (verified in UI), accepted, rejected, released or blocked
  hasMoreTasks        : function() { return this.status==='blocked' || this.status === 'pending' || this.status === 'inprogress' },
  duration: function() {
    return _.reduce(this.tasks, function(sum, task) {
      return sum + task.progressInHours();
    }, 0);
  },
  remaining: function() {
    return _.reduce(this.tasks, function(sum, task) {
      if (task.status === 'completed')
      {
        return sum;
      }
      else
      {
        var progress = task.progressInHours();
        if (task.estimate > progress)
        {
          return sum + (task.estimate - progress);
        }
        else
        {
          return sum + task.estimate/2; // assume another 2 hours, or 1/2 original estimate
        }
      }
    }, 0);
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
  progressPercent : function() {
      if (!this.pbStory.hasMoreTasks()) return 100; // prevents NaN from below

      return 100 * this.duration() / this.estimate()
  },
  hasPmScore      : function() { return _.all([this.pmInfo.pm_revenue, this.pmInfo.pm_fit, this.pmInfo.pm_time, this.pmInfo.pm_risk]) },
  // PM Weight is effectively an expected ROI, but need not be absolute since it's for comparative purposes only.
  // So we try to calculate the expected annual value of doing a feature, then divide it by cost and discount by risk.
  // @todo nudge score based on 'preferShorter or preferMoreRevenue'????
  pmScore         : function() {
        if (!this.hasPmScore()) return 0;

        var storyPmInfo = this.pmInfo;

        var hourlyOpportunityCost = 100;

        var pm_weight = ((pmInfo.pm_revenue.scores[storyPmInfo.pm_revenue] * pmInfo.pm_fit.scores[storyPmInfo.pm_fit]) / (hourlyOpportunityCost * pmInfo.pm_time.scores[storyPmInfo.pm_time])) * pmInfo.pm_risk.scores[storyPmInfo.pm_risk];

        return Math.round(pm_weight);
  },
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

