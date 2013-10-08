// vim: ts=2 sw=2 :
(function(window, angular, undefined) {
  'use strict';

  var $TBUtils = function() {
    return {
      /**
       * @ngdoc function
       * @name ngCreateComputedProperty
       * @function
       *
       * @description
       *
       * Allows for creation of computed properties on scope data.
       *
       * The value will be computed at the time the function is originally called, and $scope.$watch is used to update it as needed when dependent keys are altered.
       *
       * <pre>
       *   ngCreateComputedProperty($scope, 'aSquared', 'a', function($scope) { return $scope.a * $scope.a } );
       *   ngCreateComputedProperty($scope, 'profile.fullName', '[profile.firstName,profile.lastName]', function($scope) { return $scope.profile.firstName + ' ' + $scope.profile.lastName } );
       * </pre>
       *
       *
       * @param {object} The scope context to add the computed property to.
       * @param {string} The keyPath in the scope where the computed property value should be exposed.
       * @param {string} A $scope.$watchCollection compatible string with the list of dependencies.
       * @param {function(scope)} The function that actually computes the value.
       * @returns void
       *
       * @todo Refactor into appropriate pluggable component for angular?
       */
      createComputedProperty: function(scope, computedPropertyPath, dependentProperties, f) {
        //console.log(scope.$id, ': creating computed prop: ', computedPropertyPath);
        function assignF(scope) {
          var computedVal = f(scope);

          // todo: use $parse.setter?
          var keyPathParts = computedPropertyPath.split('.');
          var computedPropertyName = keyPathParts.slice(-1)[0];
          var targetObjKeyPathParts = keyPathParts.slice(0,-1);
          //console.log('computing ', computedPropertyName, ' at ', targetObjKeyPathParts.join('.'), ' for ', scope.$id, scope, ' result: ', computedVal);

          var targetObj = scope;
          angular.forEach(targetObjKeyPathParts, function(propPart) {
            targetObj = targetObj[propPart];
          });

          targetObj[computedPropertyName] = computedVal;
        };

        scope.$watchCollection(dependentProperties, function(newVal, oldVal, scope) {
          assignF(scope);
        });
        assignF(scope);
      }
    }
  };

  angular.module('tb.ngUtils', []).factory('$TBUtils', $TBUtils);
})(window, window.angular);
