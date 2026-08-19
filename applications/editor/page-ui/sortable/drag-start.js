import { state } from "./state.js?v=2";
import { IE11OrLess, Edge, FireFox, Safari, on, off, getParentOrHost, closest, toggleClass, css, matrix, find, getWindowScrollingElement, getRect, index, getRelativeScrollOffset, clone, expando } from "./utils.js?v=2";
import { PositionGhostAbsolutely, _hideGhostForTarget, _unhideGhostForTarget, nearestEmptyInsertDetectEvent, _checkOutsideTargetEl, _saveInputCheckedState, _nextTick } from "./detect.js?v=2";
import { _disableDraggable } from "./move-helpers.js?v=2";
import { pluginEvent, _dispatchEvent } from "./plugin-manager.js?v=2";
import { Sortable } from "./constructor.js?v=2";

const dragStartMethods = {
  _isOutsideThisEl: function _isOutsideThisEl(target) {
    if (!this.el.contains(target) && target !== this.el) {
      state.lastTarget = null;
    }
  },
  _getDirection: function _getDirection(evt, target) {
    return typeof this.options.direction === 'function' ? this.options.direction.call(this, evt, target, state.dragEl) : this.options.direction;
  },
  _onTapStart: function _onTapStart( /** Event|TouchEvent */evt) {
    if (!evt.cancelable) return;
    var _this = this,
      el = this.el,
      options = this.options,
      preventOnFilter = options.preventOnFilter,
      type = evt.type,
      touch = evt.touches && evt.touches[0] || evt.pointerType && evt.pointerType === 'touch' && evt,
      target = (touch || evt).target,
      originalTarget = evt.target.shadowRoot && (evt.path && evt.path[0] || evt.composedPath && evt.composedPath()[0]) || target,
      filter = options.filter;
    _saveInputCheckedState(el);

    // Don't trigger start event when an element is been dragged, otherwise the evt.oldindex always wrong when set option.group.
    if (state.dragEl) {
      return;
    }
    if (/mousedown|pointerdown/.test(type) && evt.button !== 0 || options.disabled) {
      return; // only left button and enabled
    }

    // cancel dnd if original target is content editable
    if (originalTarget.isContentEditable) {
      return;
    }

    // Safari ignores further event handling after mousedown
    if (!this.nativeDraggable && Safari && target && target.tagName.toUpperCase() === 'SELECT') {
      return;
    }
    target = closest(target, options.draggable, el, false);
    if (target && target.animated) {
      return;
    }
    if (state.lastDownEl === target) {
      // Ignoring duplicate `down`
      return;
    }

    // Get the index of the dragged element within its parent
    state.oldIndex = index(target);
    state.oldDraggableIndex = index(target, options.draggable);

    // Check filter
    if (typeof filter === 'function') {
      if (filter.call(this, evt, target, this)) {
        _dispatchEvent({
          sortable: _this,
          rootEl: originalTarget,
          name: 'filter',
          targetEl: target,
          toEl: el,
          fromEl: el
        });
        pluginEvent('filter', _this, {
          evt: evt
        });
        preventOnFilter && evt.preventDefault();
        return; // cancel dnd
      }
    } else if (filter) {
      filter = filter.split(',').some(function (criteria) {
        criteria = closest(originalTarget, criteria.trim(), el, false);
        if (criteria) {
          _dispatchEvent({
            sortable: _this,
            rootEl: criteria,
            name: 'filter',
            targetEl: target,
            fromEl: el,
            toEl: el
          });
          pluginEvent('filter', _this, {
            evt: evt
          });
          return true;
        }
      });
      if (filter) {
        preventOnFilter && evt.preventDefault();
        return; // cancel dnd
      }
    }
    if (options.handle && !closest(originalTarget, options.handle, el, false)) {
      return;
    }

    // Prepare `dragstart`
    this._prepareDragStart(evt, touch, target);
  },
  _prepareDragStart: function _prepareDragStart( /** Event */evt, /** Touch */touch, /** HTMLElement */target) {
    var _this = this,
      el = _this.el,
      options = _this.options,
      ownerDocument = el.ownerDocument,
      dragStartFn;
    if (target && !state.dragEl && target.parentNode === el) {
      var dragRect = getRect(target);
      state.rootEl = el;
      state.dragEl = target;
      state.parentEl = state.dragEl.parentNode;
      state.nextEl = state.dragEl.nextSibling;
      state.lastDownEl = target;
      state.activeGroup = options.group;
      Sortable.dragged = state.dragEl;
      state.tapEvt = {
        target: state.dragEl,
        clientX: (touch || evt).clientX,
        clientY: (touch || evt).clientY
      };
      state.tapDistanceLeft = state.tapEvt.clientX - dragRect.left;
      state.tapDistanceTop = state.tapEvt.clientY - dragRect.top;
      this._lastX = (touch || evt).clientX;
      this._lastY = (touch || evt).clientY;
      state.dragEl.style['will-change'] = 'all';
      dragStartFn = function dragStartFn() {
        pluginEvent('delayEnded', _this, {
          evt: evt
        });
        if (Sortable.eventCanceled) {
          _this._onDrop();
          return;
        }
        // Delayed drag has been triggered
        // we can re-enable the events: touchmove/mousemove
        _this._disableDelayedDragEvents();
        if (!FireFox && _this.nativeDraggable) {
          state.dragEl.draggable = true;
        }

        // Bind the events: dragstart/dragend
        _this._triggerDragStart(evt, touch);

        // Drag start event
        _dispatchEvent({
          sortable: _this,
          name: 'choose',
          originalEvent: evt
        });

        // Chosen item
        toggleClass(state.dragEl, options.chosenClass, true);
      };

      // Disable "draggable"
      options.ignore.split(',').forEach(function (criteria) {
        find(state.dragEl, criteria.trim(), _disableDraggable);
      });
      on(ownerDocument, 'dragover', nearestEmptyInsertDetectEvent);
      on(ownerDocument, 'mousemove', nearestEmptyInsertDetectEvent);
      on(ownerDocument, 'touchmove', nearestEmptyInsertDetectEvent);
      if (options.supportPointer) {
        on(ownerDocument, 'pointerup', _this._onDrop);
        // Native D&D triggers pointercancel
        !this.nativeDraggable && on(ownerDocument, 'pointercancel', _this._onDrop);
      } else {
        on(ownerDocument, 'mouseup', _this._onDrop);
        on(ownerDocument, 'touchend', _this._onDrop);
        on(ownerDocument, 'touchcancel', _this._onDrop);
      }

      // Make dragEl draggable (must be before delay for FireFox)
      if (FireFox && this.nativeDraggable) {
        this.options.touchStartThreshold = 4;
        state.dragEl.draggable = true;
      }
      pluginEvent('delayStart', this, {
        evt: evt
      });

      // Delay is impossible for native DnD in Edge or IE
      if (options.delay && (!options.delayOnTouchOnly || touch) && (!this.nativeDraggable || !(Edge || IE11OrLess))) {
        if (Sortable.eventCanceled) {
          this._onDrop();
          return;
        }
        // If the user moves the pointer or let go the click or touch
        // before the delay has been reached:
        // disable the delayed drag
        if (options.supportPointer) {
          on(ownerDocument, 'pointerup', _this._disableDelayedDrag);
          on(ownerDocument, 'pointercancel', _this._disableDelayedDrag);
        } else {
          on(ownerDocument, 'mouseup', _this._disableDelayedDrag);
          on(ownerDocument, 'touchend', _this._disableDelayedDrag);
          on(ownerDocument, 'touchcancel', _this._disableDelayedDrag);
        }
        on(ownerDocument, 'mousemove', _this._delayedDragTouchMoveHandler);
        on(ownerDocument, 'touchmove', _this._delayedDragTouchMoveHandler);
        options.supportPointer && on(ownerDocument, 'pointermove', _this._delayedDragTouchMoveHandler);
        _this._dragStartTimer = setTimeout(dragStartFn, options.delay);
      } else {
        dragStartFn();
      }
    }
  },
  _delayedDragTouchMoveHandler: function _delayedDragTouchMoveHandler( /** TouchEvent|PointerEvent **/e) {
    var touch = e.touches ? e.touches[0] : e;
    if (Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) >= Math.floor(this.options.touchStartThreshold / (this.nativeDraggable && window.devicePixelRatio || 1))) {
      this._disableDelayedDrag();
    }
  },
  _disableDelayedDrag: function _disableDelayedDrag() {
    state.dragEl && _disableDraggable(state.dragEl);
    clearTimeout(this._dragStartTimer);
    this._disableDelayedDragEvents();
  },
  _disableDelayedDragEvents: function _disableDelayedDragEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, 'mouseup', this._disableDelayedDrag);
    off(ownerDocument, 'touchend', this._disableDelayedDrag);
    off(ownerDocument, 'touchcancel', this._disableDelayedDrag);
    off(ownerDocument, 'pointerup', this._disableDelayedDrag);
    off(ownerDocument, 'pointercancel', this._disableDelayedDrag);
    off(ownerDocument, 'mousemove', this._delayedDragTouchMoveHandler);
    off(ownerDocument, 'touchmove', this._delayedDragTouchMoveHandler);
    off(ownerDocument, 'pointermove', this._delayedDragTouchMoveHandler);
  },
  _triggerDragStart: function _triggerDragStart( /** Event */evt, /** Touch */touch) {
    touch = touch || evt.pointerType == 'touch' && evt;
    if (!this.nativeDraggable || touch) {
      if (this.options.supportPointer) {
        on(document, 'pointermove', this._onTouchMove);
      } else if (touch) {
        on(document, 'touchmove', this._onTouchMove);
      } else {
        on(document, 'mousemove', this._onTouchMove);
      }
    } else {
      on(state.dragEl, 'dragend', this);
      on(state.rootEl, 'dragstart', this._onDragStart);
    }
    try {
      if (document.selection) {
        _nextTick(function () {
          document.selection.empty();
        });
      } else {
        window.getSelection().removeAllRanges();
      }
    } catch (err) {}
  },
  _dragStarted: function _dragStarted(fallback, evt) {
    state.awaitingDragStarted = false;
    if (state.rootEl && state.dragEl) {
      pluginEvent('dragStarted', this, {
        evt: evt
      });
      if (this.nativeDraggable) {
        on(document, 'dragover', _checkOutsideTargetEl);
      }
      var options = this.options;

      // Apply effect
      !fallback && toggleClass(state.dragEl, options.dragClass, false);
      toggleClass(state.dragEl, options.ghostClass, true);
      Sortable.active = this;
      fallback && this._appendGhost();

      // Drag start event
      _dispatchEvent({
        sortable: this,
        name: 'start',
        originalEvent: evt
      });
    } else {
      this._nulling();
    }
  },
  _emulateDragOver: function _emulateDragOver() {
    if (state.touchEvt) {
      this._lastX = state.touchEvt.clientX;
      this._lastY = state.touchEvt.clientY;
      _hideGhostForTarget();
      var target = document.elementFromPoint(state.touchEvt.clientX, state.touchEvt.clientY);
      var parent = target;
      while (target && target.shadowRoot) {
        target = target.shadowRoot.elementFromPoint(state.touchEvt.clientX, state.touchEvt.clientY);
        if (target === parent) break;
        parent = target;
      }
      state.dragEl.parentNode[expando]._isOutsideThisEl(target);
      if (parent) {
        do {
          if (parent[expando]) {
            var inserted = void 0;
            inserted = parent[expando]._onDragOver({
              clientX: state.touchEvt.clientX,
              clientY: state.touchEvt.clientY,
              target: target,
              rootEl: parent
            });
            if (inserted && !this.options.dragoverBubble) {
              break;
            }
          }
          target = parent; // store last element
        }
        /* jshint boss:true */ while (parent = getParentOrHost(parent));
      }
      _unhideGhostForTarget();
    }
  },
  _onTouchMove: function _onTouchMove( /**TouchEvent*/evt) {
    if (state.tapEvt) {
      var options = this.options,
        fallbackTolerance = options.fallbackTolerance,
        fallbackOffset = options.fallbackOffset,
        touch = evt.touches ? evt.touches[0] : evt,
        ghostMatrix = state.ghostEl && matrix(state.ghostEl, true),
        scaleX = state.ghostEl && ghostMatrix && ghostMatrix.a,
        scaleY = state.ghostEl && ghostMatrix && ghostMatrix.d,
        relativeScrollOffset = PositionGhostAbsolutely && state.ghostRelativeParent && getRelativeScrollOffset(state.ghostRelativeParent),
        dx = (touch.clientX - state.tapEvt.clientX + fallbackOffset.x) / (scaleX || 1) + (relativeScrollOffset ? relativeScrollOffset[0] - state.ghostRelativeParentInitialScroll[0] : 0) / (scaleX || 1),
        dy = (touch.clientY - state.tapEvt.clientY + fallbackOffset.y) / (scaleY || 1) + (relativeScrollOffset ? relativeScrollOffset[1] - state.ghostRelativeParentInitialScroll[1] : 0) / (scaleY || 1);

      // only set the status to dragging, when we are actually dragging
      if (!Sortable.active && !state.awaitingDragStarted) {
        if (fallbackTolerance && Math.max(Math.abs(touch.clientX - this._lastX), Math.abs(touch.clientY - this._lastY)) < fallbackTolerance) {
          return;
        }
        this._onDragStart(evt, true);
      }
      if (state.ghostEl) {
        if (ghostMatrix) {
          ghostMatrix.e += dx - (state.lastDx || 0);
          ghostMatrix.f += dy - (state.lastDy || 0);
        } else {
          ghostMatrix = {
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: dx,
            f: dy
          };
        }
        var cssMatrix = "matrix(".concat(ghostMatrix.a, ",").concat(ghostMatrix.b, ",").concat(ghostMatrix.c, ",").concat(ghostMatrix.d, ",").concat(ghostMatrix.e, ",").concat(ghostMatrix.f, ")");
        css(state.ghostEl, 'webkitTransform', cssMatrix);
        css(state.ghostEl, 'mozTransform', cssMatrix);
        css(state.ghostEl, 'msTransform', cssMatrix);
        css(state.ghostEl, 'transform', cssMatrix);
        state.lastDx = dx;
        state.lastDy = dy;
        state.touchEvt = touch;
      }
      evt.cancelable && evt.preventDefault();
    }
  },
  _appendGhost: function _appendGhost() {
    // Bug if using scale(): https://stackoverflow.com/questions/2637058
    // Not being adjusted for
    if (!state.ghostEl) {
      var container = this.options.fallbackOnBody ? document.body : state.rootEl,
        rect = getRect(state.dragEl, true, PositionGhostAbsolutely, true, container),
        options = this.options;

      // Position absolutely
      if (PositionGhostAbsolutely) {
        // Get relatively positioned parent
        state.ghostRelativeParent = container;
        while (css(state.ghostRelativeParent, 'position') === 'static' && css(state.ghostRelativeParent, 'transform') === 'none' && state.ghostRelativeParent !== document) {
          state.ghostRelativeParent = state.ghostRelativeParent.parentNode;
        }
        if (state.ghostRelativeParent !== document.body && state.ghostRelativeParent !== document.documentElement) {
          if (state.ghostRelativeParent === document) state.ghostRelativeParent = getWindowScrollingElement();
          rect.top += state.ghostRelativeParent.scrollTop;
          rect.left += state.ghostRelativeParent.scrollLeft;
        } else {
          state.ghostRelativeParent = getWindowScrollingElement();
        }
        state.ghostRelativeParentInitialScroll = getRelativeScrollOffset(state.ghostRelativeParent);
      }
      state.ghostEl = state.dragEl.cloneNode(true);
      toggleClass(state.ghostEl, options.ghostClass, false);
      toggleClass(state.ghostEl, options.fallbackClass, true);
      toggleClass(state.ghostEl, options.dragClass, true);
      css(state.ghostEl, 'transition', '');
      css(state.ghostEl, 'transform', '');
      css(state.ghostEl, 'box-sizing', 'border-box');
      css(state.ghostEl, 'margin', 0);
      css(state.ghostEl, 'top', rect.top);
      css(state.ghostEl, 'left', rect.left);
      css(state.ghostEl, 'width', rect.width);
      css(state.ghostEl, 'height', rect.height);
      css(state.ghostEl, 'opacity', '0.8');
      css(state.ghostEl, 'position', PositionGhostAbsolutely ? 'absolute' : 'fixed');
      css(state.ghostEl, 'zIndex', '100000');
      css(state.ghostEl, 'pointerEvents', 'none');
      Sortable.ghost = state.ghostEl;
      container.appendChild(state.ghostEl);

      // Set transform-origin
      css(state.ghostEl, 'transform-origin', state.tapDistanceLeft / parseInt(state.ghostEl.style.width) * 100 + '% ' + state.tapDistanceTop / parseInt(state.ghostEl.style.height) * 100 + '%');
    }
  },
  _onDragStart: function _onDragStart( /**Event*/evt, /**boolean*/fallback) {
    var _this = this;
    var dataTransfer = evt.dataTransfer;
    var options = _this.options;
    pluginEvent('dragStart', this, {
      evt: evt
    });
    if (Sortable.eventCanceled) {
      this._onDrop();
      return;
    }
    pluginEvent('setupClone', this);
    if (!Sortable.eventCanceled) {
      state.cloneEl = clone(state.dragEl);
      state.cloneEl.removeAttribute("id");
      state.cloneEl.draggable = false;
      state.cloneEl.style['will-change'] = '';
      this._hideClone();
      toggleClass(state.cloneEl, this.options.chosenClass, false);
      Sortable.clone = state.cloneEl;
    }

    // #1143: IFrame support workaround
    _this.cloneId = _nextTick(function () {
      pluginEvent('clone', _this);
      if (Sortable.eventCanceled) return;
      if (!_this.options.removeCloneOnHide) {
        state.rootEl.insertBefore(state.cloneEl, state.dragEl);
      }
      _this._hideClone();
      _dispatchEvent({
        sortable: _this,
        name: 'clone'
      });
    });
    !fallback && toggleClass(state.dragEl, options.dragClass, true);

    // Set proper drop events
    if (fallback) {
      state.ignoreNextClick = true;
      _this._loopId = setInterval(_this._emulateDragOver, 50);
    } else {
      // Undo what was set in _prepareDragStart before drag started
      off(document, 'mouseup', _this._onDrop);
      off(document, 'touchend', _this._onDrop);
      off(document, 'touchcancel', _this._onDrop);
      if (dataTransfer) {
        dataTransfer.effectAllowed = 'move';
        options.setData && options.setData.call(_this, dataTransfer, state.dragEl);
      }
      on(document, 'drop', _this);

      // #1276 fix:
      css(state.dragEl, 'transform', 'translateZ(0)');
    }
    state.awaitingDragStarted = true;
    _this._dragStartId = _nextTick(_this._dragStarted.bind(_this, fallback, evt));
    on(document, 'selectstart', _this);
    state.moved = true;
    window.getSelection().removeAllRanges();
    if (Safari) {
      css(document.body, 'user-select', 'none');
    }
  },
};
export { dragStartMethods };
