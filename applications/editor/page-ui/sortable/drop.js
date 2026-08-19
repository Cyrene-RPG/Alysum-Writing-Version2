import { state } from "./state.js?v=2";
import { Safari, off, closest, toggleClass, css, index, expando } from "./utils.js?v=2";
import { _prepareGroup, _generateId, _cancelNextTick } from "./detect.js?v=2";
import { _globalDragOver, _disableDraggable } from "./move-helpers.js?v=2";
import { PluginManager, pluginEvent, _dispatchEvent } from "./plugin-manager.js?v=2";
import { Sortable } from "./constructor.js?v=2";

const dropMethods = {
  _onDrop: function _onDrop( /**Event*/evt) {
    var el = this.el,
      options = this.options;

    // Get the index of the dragged element within its parent
    state.newIndex = index(state.dragEl);
    state.newDraggableIndex = index(state.dragEl, options.draggable);
    pluginEvent('drop', this, {
      evt: evt
    });
    state.parentEl = state.dragEl && state.dragEl.parentNode;

    // Get again after plugin event
    state.newIndex = index(state.dragEl);
    state.newDraggableIndex = index(state.dragEl, options.draggable);
    if (Sortable.eventCanceled) {
      this._nulling();
      return;
    }
    state.awaitingDragStarted = false;
    state.isCircumstantialInvert = false;
    state.pastFirstInvertThresh = false;
    clearInterval(this._loopId);
    clearTimeout(this._dragStartTimer);
    _cancelNextTick(this.cloneId);
    _cancelNextTick(this._dragStartId);

    // Unbind events
    if (this.nativeDraggable) {
      off(document, 'drop', this);
      off(el, 'dragstart', this._onDragStart);
    }
    this._offMoveEvents();
    this._offUpEvents();
    if (Safari) {
      css(document.body, 'user-select', '');
    }
    css(state.dragEl, 'transform', '');
    if (evt) {
      if (state.moved) {
        evt.cancelable && evt.preventDefault();
        !options.dropBubble && evt.stopPropagation();
      }
      state.ghostEl && state.ghostEl.parentNode && state.ghostEl.parentNode.removeChild(state.ghostEl);
      if (state.rootEl === state.parentEl || state.putSortable && state.putSortable.lastPutMode !== 'clone') {
        // Remove clone(s)
        state.cloneEl && state.cloneEl.parentNode && state.cloneEl.parentNode.removeChild(state.cloneEl);
      }
      if (state.dragEl) {
        if (this.nativeDraggable) {
          off(state.dragEl, 'dragend', this);
        }
        _disableDraggable(state.dragEl);
        state.dragEl.style['will-change'] = '';

        // Remove classes
        // ghostClass is added in dragStarted
        if (state.moved && !state.awaitingDragStarted) {
          toggleClass(state.dragEl, state.putSortable ? state.putSortable.options.ghostClass : this.options.ghostClass, false);
        }
        toggleClass(state.dragEl, this.options.chosenClass, false);

        // Drag stop event
        _dispatchEvent({
          sortable: this,
          name: 'unchoose',
          toEl: state.parentEl,
          newIndex: null,
          newDraggableIndex: null,
          originalEvent: evt
        });
        if (state.rootEl !== state.parentEl) {
          if (state.newIndex >= 0) {
            // Add event
            _dispatchEvent({
              rootEl: state.parentEl,
              name: 'add',
              toEl: state.parentEl,
              fromEl: state.rootEl,
              originalEvent: evt
            });

            // Remove event
            _dispatchEvent({
              sortable: this,
              name: 'remove',
              toEl: state.parentEl,
              originalEvent: evt
            });

            // drag from one list and drop into another
            _dispatchEvent({
              rootEl: state.parentEl,
              name: 'sort',
              toEl: state.parentEl,
              fromEl: state.rootEl,
              originalEvent: evt
            });
            _dispatchEvent({
              sortable: this,
              name: 'sort',
              toEl: state.parentEl,
              originalEvent: evt
            });
          }
          state.putSortable && state.putSortable.save();
        } else {
          if (state.newIndex !== state.oldIndex) {
            if (state.newIndex >= 0) {
              // drag & drop within the same list
              _dispatchEvent({
                sortable: this,
                name: 'update',
                toEl: state.parentEl,
                originalEvent: evt
              });
              _dispatchEvent({
                sortable: this,
                name: 'sort',
                toEl: state.parentEl,
                originalEvent: evt
              });
            }
          }
        }
        if (Sortable.active) {
          /* jshint eqnull:true */
          if (state.newIndex == null || state.newIndex === -1) {
            state.newIndex = state.oldIndex;
            state.newDraggableIndex = state.oldDraggableIndex;
          }
          _dispatchEvent({
            sortable: this,
            name: 'end',
            toEl: state.parentEl,
            originalEvent: evt
          });

          // Save sorting
          this.save();
        }
      }
    }
    this._nulling();
  },
  _nulling: function _nulling() {
    pluginEvent('nulling', this);
    state.rootEl = state.dragEl = state.parentEl = state.ghostEl = state.nextEl = state.cloneEl = state.lastDownEl = state.cloneHidden = state.tapEvt = state.touchEvt = state.moved = state.newIndex = state.newDraggableIndex = state.oldIndex = state.oldDraggableIndex = state.lastTarget = state.lastDirection = state.putSortable = state.activeGroup = Sortable.dragged = Sortable.ghost = Sortable.clone = Sortable.active = null;
    state.savedInputChecked.forEach(function (el) {
      el.checked = true;
    });
    state.savedInputChecked.length = state.lastDx = state.lastDy = 0;
  },
  handleEvent: function handleEvent( /**Event*/evt) {
    switch (evt.type) {
      case 'drop':
      case 'dragend':
        this._onDrop(evt);
        break;
      case 'dragenter':
      case 'dragover':
        if (state.dragEl) {
          this._onDragOver(evt);
          _globalDragOver(evt);
        }
        break;
      case 'selectstart':
        evt.preventDefault();
        break;
    }
  },
  /**
   * Serializes the item into an array of string.
   * @returns {String[]}
   */
  toArray: function toArray() {
    var order = [],
      el,
      children = this.el.children,
      i = 0,
      n = children.length,
      options = this.options;
    for (; i < n; i++) {
      el = children[i];
      if (closest(el, options.draggable, this.el, false)) {
        order.push(el.getAttribute(options.dataIdAttr) || _generateId(el));
      }
    }
    return order;
  },
  /**
   * Sorts the elements according to the array.
   * @param  {String[]}  order  order of the items
   */
  sort: function sort(order, useAnimation) {
    var items = {},
      rootEl = this.el;
    this.toArray().forEach(function (id, i) {
      var el = rootEl.children[i];
      if (closest(el, this.options.draggable, rootEl, false)) {
        items[id] = el;
      }
    }, this);
    useAnimation && this.captureAnimationState();
    order.forEach(function (id) {
      if (items[id]) {
        rootEl.removeChild(items[id]);
        rootEl.appendChild(items[id]);
      }
    });
    useAnimation && this.animateAll();
  },
  /**
   * Save the current sorting
   */
  save: function save() {
    var store = this.options.store;
    store && store.set && store.set(this);
  },
  /**
   * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
   * @param   {HTMLElement}  el
   * @param   {String}       [selector]  default: `options.draggable`
   * @returns {HTMLElement|null}
   */
  closest: function closest$1(el, selector) {
    return closest(el, selector || this.options.draggable, this.el, false);
  },
  /**
   * Set/get option
   * @param   {string} name
   * @param   {*}      [value]
   * @returns {*}
   */
  option: function option(name, value) {
    var options = this.options;
    if (value === void 0) {
      return options[name];
    } else {
      var modifiedValue = PluginManager.modifyOption(this, name, value);
      if (typeof modifiedValue !== 'undefined') {
        options[name] = modifiedValue;
      } else {
        options[name] = value;
      }
      if (name === 'group') {
        _prepareGroup(options);
      }
    }
  },
  /**
   * Destroy
   */
  destroy: function destroy() {
    pluginEvent('destroy', this);
    var el = this.el;
    el[expando] = null;
    off(el, 'mousedown', this._onTapStart);
    off(el, 'touchstart', this._onTapStart);
    off(el, 'pointerdown', this._onTapStart);
    if (this.nativeDraggable) {
      off(el, 'dragover', this);
      off(el, 'dragenter', this);
    }
    // Remove draggable attributes
    Array.prototype.forEach.call(el.querySelectorAll('[draggable]'), function (el) {
      el.removeAttribute('draggable');
    });
    this._onDrop();
    this._disableDelayedDragEvents();
    state.sortables.splice(state.sortables.indexOf(this.el), 1);
    this.el = el = null;
  },
  _hideClone: function _hideClone() {
    if (!state.cloneHidden) {
      pluginEvent('hideClone', this);
      if (Sortable.eventCanceled) return;
      css(state.cloneEl, 'display', 'none');
      if (this.options.removeCloneOnHide && state.cloneEl.parentNode) {
        state.cloneEl.parentNode.removeChild(state.cloneEl);
      }
      state.cloneHidden = true;
    }
  },
  _showClone: function _showClone(putSortable) {
    if (putSortable.lastPutMode !== 'clone') {
      this._hideClone();
      return;
    }
    if (state.cloneHidden) {
      pluginEvent('showClone', this);
      if (Sortable.eventCanceled) return;

      // show clone at dragEl or original position
      if (state.dragEl.parentNode == state.rootEl && !this.options.group.revertClone) {
        state.rootEl.insertBefore(state.cloneEl, state.dragEl);
      } else if (state.nextEl) {
        state.rootEl.insertBefore(state.cloneEl, state.nextEl);
      } else {
        state.rootEl.appendChild(state.cloneEl);
      }
      if (this.options.group.revertClone) {
        this.animate(state.dragEl, state.cloneEl);
      }
      css(state.cloneEl, 'display', '');
      state.cloneHidden = false;
    }
  }
};
export { dropMethods };
