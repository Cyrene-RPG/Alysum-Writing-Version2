import { state, host } from "./state.js?v=2";
import {
  on,
  off,
  css,
  find,
  closest,
  toggleClass,
  clone,
  index,
  getChild,
  expando,
  throttle,
  extend,
  version,
  _objectSpread2
} from "./utils.js?v=2";
import { PluginManager } from "./plugin-manager.js?v=2";
import { documentExists, _detectDirection, _nextTick, _cancelNextTick } from "./detect.js?v=2";
import { Sortable } from "./constructor.js?v=2";
import { dragStartMethods } from "./drag-start.js?v=2";
import { dragOverMethods } from "./drag-over.js?v=2";
import { dropMethods } from "./drop.js?v=2";
import { AutoScrollPlugin } from "./plugins/auto-scroll.js?v=2";
import { Remove, Revert } from "./plugins/on-spill.js?v=2";
import { SwapPlugin } from "./plugins/swap.js?v=2";
import { MultiDragPlugin } from "./plugins/multi-drag.js?v=2";

host.Sortable = Sortable;

Sortable.prototype = Object.assign({
  constructor: Sortable
}, dragStartMethods, dragOverMethods, dropMethods);

Sortable.utils = {
  on: on,
  off: off,
  css: css,
  find: find,
  is: function is(el, selector) {
    return !!closest(el, selector, el, false);
  },
  extend: extend,
  throttle: throttle,
  closest: closest,
  toggleClass: toggleClass,
  clone: clone,
  index: index,
  nextTick: _nextTick,
  cancelNextTick: _cancelNextTick,
  detectDirection: _detectDirection,
  getChild: getChild,
  expando: expando
};

Sortable.get = function (element) {
  return element[expando];
};

Sortable.mount = function () {
  for (var _len = arguments.length, plugins = new Array(_len), _key = 0; _key < _len; _key++) {
    plugins[_key] = arguments[_key];
  }
  if (plugins[0].constructor === Array) plugins = plugins[0];
  plugins.forEach(function (plugin) {
    if (!plugin.prototype || !plugin.prototype.constructor) {
      throw "Sortable: Mounted plugin must be a constructor function, not ".concat({}.toString.call(plugin));
    }
    if (plugin.utils) Sortable.utils = _objectSpread2(_objectSpread2({}, Sortable.utils), plugin.utils);
    PluginManager.mount(plugin);
  });
};

Sortable.create = function (el, options) {
  return new Sortable(el, options);
};

Sortable.version = version;

if (documentExists) {
  on(document, "touchmove", function (evt) {
    if ((Sortable.active || state.awaitingDragStarted) && evt.cancelable) {
      evt.preventDefault();
    }
  });
}

Sortable.mount(new AutoScrollPlugin());
Sortable.mount(Remove, Revert);

export default Sortable;
export { MultiDragPlugin as MultiDrag, Sortable, SwapPlugin as Swap };
