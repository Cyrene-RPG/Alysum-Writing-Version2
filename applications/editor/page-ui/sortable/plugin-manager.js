import { state, host } from "./state.js?v=2";
import { _hideGhostForTarget, _unhideGhostForTarget } from "./detect.js?v=2";
import { _objectSpread2, _extends, _objectWithoutProperties, expando, IE11OrLess, Edge } from "./utils.js?v=2";

var plugins = [];
var defaults = {
  initializeByDefault: true
};
var PluginManager = {
  mount: function mount(plugin) {
    // Set default static properties
    for (var option in defaults) {
      if (defaults.hasOwnProperty(option) && !(option in plugin)) {
        plugin[option] = defaults[option];
      }
    }
    plugins.forEach(function (p) {
      if (p.pluginName === plugin.pluginName) {
        throw "Sortable: Cannot mount plugin ".concat(plugin.pluginName, " more than once");
      }
    });
    plugins.push(plugin);
  },
  pluginEvent: function pluginEvent(eventName, sortable, evt) {
    var _this = this;
    this.eventCanceled = false;
    evt.cancel = function () {
      _this.eventCanceled = true;
    };
    var eventNameGlobal = eventName + 'Global';
    plugins.forEach(function (plugin) {
      if (!sortable[plugin.pluginName]) return;
      // Fire global events if it exists in this sortable
      if (sortable[plugin.pluginName][eventNameGlobal]) {
        sortable[plugin.pluginName][eventNameGlobal](_objectSpread2({
          sortable: sortable
        }, evt));
      }

      // Only fire plugin event if plugin is enabled in this sortable,
      // and plugin has event defined
      if (sortable.options[plugin.pluginName] && sortable[plugin.pluginName][eventName]) {
        sortable[plugin.pluginName][eventName](_objectSpread2({
          sortable: sortable
        }, evt));
      }
    });
  },
  initializePlugins: function initializePlugins(sortable, el, defaults, options) {
    plugins.forEach(function (plugin) {
      var pluginName = plugin.pluginName;
      if (!sortable.options[pluginName] && !plugin.initializeByDefault) return;
      var initialized = new plugin(sortable, el, sortable.options);
      initialized.sortable = sortable;
      initialized.options = sortable.options;
      sortable[pluginName] = initialized;

      // Add default options from plugin
      _extends(defaults, initialized.defaults);
    });
    for (var option in sortable.options) {
      if (!sortable.options.hasOwnProperty(option)) continue;
      var modified = this.modifyOption(sortable, option, sortable.options[option]);
      if (typeof modified !== 'undefined') {
        sortable.options[option] = modified;
      }
    }
  },
  getEventProperties: function getEventProperties(name, sortable) {
    var eventProperties = {};
    plugins.forEach(function (plugin) {
      if (typeof plugin.eventProperties !== 'function') return;
      _extends(eventProperties, plugin.eventProperties.call(sortable[plugin.pluginName], name));
    });
    return eventProperties;
  },
  modifyOption: function modifyOption(sortable, name, value) {
    var modifiedValue;
    plugins.forEach(function (plugin) {
      // Plugin must exist on the Sortable
      if (!sortable[plugin.pluginName]) return;

      // If static option listener exists for this option, call in the context of the Sortable's instance of this plugin
      if (plugin.optionListeners && typeof plugin.optionListeners[name] === 'function') {
        modifiedValue = plugin.optionListeners[name].call(sortable[plugin.pluginName], value);
      }
    });
    return modifiedValue;
  }
};

function dispatchEvent(_ref) {
  var sortable = _ref.sortable,
    rootEl = _ref.rootEl,
    name = _ref.name,
    targetEl = _ref.targetEl,
    cloneEl = _ref.cloneEl,
    toEl = _ref.toEl,
    fromEl = _ref.fromEl,
    oldIndex = _ref.oldIndex,
    newIndex = _ref.newIndex,
    oldDraggableIndex = _ref.oldDraggableIndex,
    newDraggableIndex = _ref.newDraggableIndex,
    originalEvent = _ref.originalEvent,
    putSortable = _ref.putSortable,
    extraEventProperties = _ref.extraEventProperties;
  sortable = sortable || rootEl && rootEl[expando];
  if (!sortable) return;
  var evt,
    options = sortable.options,
    onName = 'on' + name.charAt(0).toUpperCase() + name.substr(1);
  // Support for new CustomEvent feature
  if (window.CustomEvent && !IE11OrLess && !Edge) {
    evt = new CustomEvent(name, {
      bubbles: true,
      cancelable: true
    });
  } else {
    evt = document.createEvent('Event');
    evt.initEvent(name, true, true);
  }
  evt.to = toEl || rootEl;
  evt.from = fromEl || rootEl;
  evt.item = targetEl || rootEl;
  evt.clone = cloneEl;
  evt.oldIndex = oldIndex;
  evt.newIndex = newIndex;
  evt.oldDraggableIndex = oldDraggableIndex;
  evt.newDraggableIndex = newDraggableIndex;
  evt.originalEvent = originalEvent;
  evt.pullMode = putSortable ? putSortable.lastPutMode : undefined;
  var allEventProperties = _objectSpread2(_objectSpread2({}, extraEventProperties), PluginManager.getEventProperties(name, sortable));
  for (var option in allEventProperties) {
    evt[option] = allEventProperties[option];
  }
  if (rootEl) {
    rootEl.dispatchEvent(evt);
  }
  if (options[onName]) {
    options[onName].call(sortable, evt);
  }
}

var _excluded = ["evt"];
var pluginEvent = function pluginEvent(eventName, sortable) {
  var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
    originalEvent = _ref.evt,
    data = _objectWithoutProperties(_ref, _excluded);
  PluginManager.pluginEvent.bind(host.Sortable)(eventName, sortable, _objectSpread2({
    dragEl: state.dragEl,
    parentEl: state.parentEl,
    ghostEl: state.ghostEl,
    rootEl: state.rootEl,
    nextEl: state.nextEl,
    lastDownEl: state.lastDownEl,
    cloneEl: state.cloneEl,
    cloneHidden: state.cloneHidden,
    dragStarted: state.moved,
    putSortable: state.putSortable,
    activeSortable: host.Sortable.active,
    originalEvent: originalEvent,
    oldIndex: state.oldIndex,
    oldDraggableIndex: state.oldDraggableIndex,
    newIndex: state.newIndex,
    newDraggableIndex: state.newDraggableIndex,
    hideGhostForTarget: _hideGhostForTarget,
    unhideGhostForTarget: _unhideGhostForTarget,
    cloneNowHidden: function cloneNowHidden() {
      state.cloneHidden = true;
    },
    cloneNowShown: function cloneNowShown() {
      state.cloneHidden = false;
    },
    dispatchSortableEvent: function dispatchSortableEvent(name) {
      _dispatchEvent({
        sortable: sortable,
        name: name,
        originalEvent: originalEvent
      });
    }
  }, data));
};
function _dispatchEvent(info) {
  dispatchEvent(_objectSpread2({
    putSortable: state.putSortable,
    cloneEl: state.cloneEl,
    targetEl: state.dragEl,
    rootEl: state.rootEl,
    oldIndex: state.oldIndex,
    oldDraggableIndex: state.oldDraggableIndex,
    newIndex: state.newIndex,
    newDraggableIndex: state.newDraggableIndex
  }, info));
}
export { PluginManager, dispatchEvent, pluginEvent, _dispatchEvent };
