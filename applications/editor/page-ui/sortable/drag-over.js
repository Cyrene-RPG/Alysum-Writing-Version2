import { state } from "./state.js?v=2";
import { _objectSpread2, off, closest, toggleClass, css, getRect, isScrolledPast, getChild, lastChild, index, scrollBy, expando } from "./utils.js?v=2";
import { _dragElInRowColumn, nearestEmptyInsertDetectEvent } from "./detect.js?v=2";
import { _onMove, _unsilent, _ghostIsFirst, _ghostIsLast, _getSwapDirection } from "./move-helpers.js?v=2";
import { pluginEvent, _dispatchEvent } from "./plugin-manager.js?v=2";
import { Sortable } from "./constructor.js?v=2";

const dragOverMethods = {
  // Returns true - if no further action is needed (either inserted or another condition)
  _onDragOver: function _onDragOver( /**Event*/evt) {
    var el = this.el,
      target = evt.target,
      dragRect,
      targetRect,
      revert,
      options = this.options,
      group = options.group,
      activeSortable = Sortable.active,
      isOwner = state.activeGroup === group,
      canSort = options.sort,
      fromSortable = state.putSortable || activeSortable,
      vertical,
      _this = this,
      completedFired = false;
    if (state._silent) return;
    function dragOverEvent(name, extra) {
      pluginEvent(name, _this, _objectSpread2({
        evt: evt,
        isOwner: isOwner,
        axis: vertical ? 'vertical' : 'horizontal',
        revert: revert,
        dragRect: dragRect,
        targetRect: targetRect,
        canSort: canSort,
        fromSortable: fromSortable,
        target: target,
        completed: completed,
        onMove: function onMove(target, after) {
          return _onMove(state.rootEl, el, state.dragEl, dragRect, target, getRect(target), evt, after);
        },
        changed: changed
      }, extra));
    }

    // Capture animation state
    function capture() {
      dragOverEvent('dragOverAnimationCapture');
      _this.captureAnimationState();
      if (_this !== fromSortable) {
        fromSortable.captureAnimationState();
      }
    }

    // Return invocation when dragEl is inserted (or completed)
    function completed(insertion) {
      dragOverEvent('dragOverCompleted', {
        insertion: insertion
      });
      if (insertion) {
        // Clones must be hidden before folding animation to capture dragRectAbsolute properly
        if (isOwner) {
          activeSortable._hideClone();
        } else {
          activeSortable._showClone(_this);
        }
        if (_this !== fromSortable) {
          // Set ghost class to new sortable's ghost class
          toggleClass(state.dragEl, state.putSortable ? state.putSortable.options.ghostClass : activeSortable.options.ghostClass, false);
          toggleClass(state.dragEl, options.ghostClass, true);
        }
        if (state.putSortable !== _this && _this !== Sortable.active) {
          state.putSortable = _this;
        } else if (_this === Sortable.active && state.putSortable) {
          state.putSortable = null;
        }

        // Animation
        if (fromSortable === _this) {
          _this._ignoreWhileAnimating = target;
        }
        _this.animateAll(function () {
          dragOverEvent('dragOverAnimationComplete');
          _this._ignoreWhileAnimating = null;
        });
        if (_this !== fromSortable) {
          fromSortable.animateAll();
          fromSortable._ignoreWhileAnimating = null;
        }
      }

      // Null lastTarget if it is not inside a previously swapped element
      if (target === state.dragEl && !state.dragEl.animated || target === el && !target.animated) {
        state.lastTarget = null;
      }

      // no bubbling and not fallback
      if (!options.dragoverBubble && !evt.rootEl && target !== document) {
        state.dragEl.parentNode[expando]._isOutsideThisEl(evt.target);

        // Do not detect for empty insert if already inserted
        !insertion && nearestEmptyInsertDetectEvent(evt);
      }
      !options.dragoverBubble && evt.stopPropagation && evt.stopPropagation();
      return completedFired = true;
    }

    // Call when dragEl has been inserted
    function changed() {
      state.newIndex = index(state.dragEl);
      state.newDraggableIndex = index(state.dragEl, options.draggable);
      _dispatchEvent({
        sortable: _this,
        name: 'change',
        toEl: el,
        newIndex: state.newIndex,
        newDraggableIndex: state.newDraggableIndex,
        originalEvent: evt
      });
    }
    if (evt.preventDefault !== void 0) {
      evt.cancelable && evt.preventDefault();
    }
    target = closest(target, options.draggable, el, true);
    dragOverEvent('dragOver');
    if (Sortable.eventCanceled) return completedFired;
    if (state.dragEl.contains(evt.target) || target.animated && target.animatingX && target.animatingY || _this._ignoreWhileAnimating === target) {
      return completed(false);
    }
    state.ignoreNextClick = false;
    if (activeSortable && !options.disabled && (isOwner ? canSort || (revert = state.parentEl !== state.rootEl) // Reverting item into the original list
    : state.putSortable === this || (this.lastPutMode = state.activeGroup.checkPull(this, activeSortable, state.dragEl, evt)) && group.checkPut(this, activeSortable, state.dragEl, evt))) {
      vertical = this._getDirection(evt, target) === 'vertical';
      dragRect = getRect(state.dragEl);
      dragOverEvent('dragOverValid');
      if (Sortable.eventCanceled) return completedFired;
      if (revert) {
        state.parentEl = state.rootEl; // actualization
        capture();
        this._hideClone();
        dragOverEvent('revert');
        if (!Sortable.eventCanceled) {
          if (state.nextEl) {
            state.rootEl.insertBefore(state.dragEl, state.nextEl);
          } else {
            state.rootEl.appendChild(state.dragEl);
          }
        }
        return completed(true);
      }
      var elLastChild = lastChild(el, options.draggable);
      if (!elLastChild || _ghostIsLast(evt, vertical, this) && !elLastChild.animated) {
        // Insert to end of list

        // If already at end of list: Do not insert
        if (elLastChild === state.dragEl) {
          return completed(false);
        }

        // if there is a last element, it is the target
        if (elLastChild && el === evt.target) {
          target = elLastChild;
        }
        if (target) {
          targetRect = getRect(target);
        }
        if (_onMove(state.rootEl, el, state.dragEl, dragRect, target, targetRect, evt, !!target) !== false) {
          capture();
          if (elLastChild && elLastChild.nextSibling) {
            // the last draggable element is not the last node
            el.insertBefore(state.dragEl, elLastChild.nextSibling);
          } else {
            el.appendChild(state.dragEl);
          }
          state.parentEl = el; // actualization

          changed();
          return completed(true);
        }
      } else if (elLastChild && _ghostIsFirst(evt, vertical, this)) {
        // Insert to start of list
        var firstChild = getChild(el, 0, options, true);
        if (firstChild === state.dragEl) {
          return completed(false);
        }
        target = firstChild;
        targetRect = getRect(target);
        if (_onMove(state.rootEl, el, state.dragEl, dragRect, target, targetRect, evt, false) !== false) {
          capture();
          el.insertBefore(state.dragEl, firstChild);
          state.parentEl = el; // actualization

          changed();
          return completed(true);
        }
      } else if (target.parentNode === el) {
        targetRect = getRect(target);
        var direction = 0,
          targetBeforeFirstSwap,
          differentLevel = state.dragEl.parentNode !== el,
          differentRowCol = !_dragElInRowColumn(state.dragEl.animated && state.dragEl.toRect || dragRect, target.animated && target.toRect || targetRect, vertical),
          side1 = vertical ? 'top' : 'left',
          scrolledPastTop = isScrolledPast(target, 'top', 'top') || isScrolledPast(state.dragEl, 'top', 'top'),
          scrollBefore = scrolledPastTop ? scrolledPastTop.scrollTop : void 0;
        if (state.lastTarget !== target) {
          targetBeforeFirstSwap = targetRect[side1];
          state.pastFirstInvertThresh = false;
          state.isCircumstantialInvert = !differentRowCol && options.invertSwap || differentLevel;
        }
        direction = _getSwapDirection(evt, target, targetRect, vertical, differentRowCol ? 1 : options.swapThreshold, options.invertedSwapThreshold == null ? options.swapThreshold : options.invertedSwapThreshold, state.isCircumstantialInvert, state.lastTarget === target);
        var sibling;
        if (direction !== 0) {
          // Check if target is beside dragEl in respective direction (ignoring hidden elements)
          var dragIndex = index(state.dragEl);
          do {
            dragIndex -= direction;
            sibling = state.parentEl.children[dragIndex];
          } while (sibling && (css(sibling, 'display') === 'none' || sibling === state.ghostEl));
        }
        // If dragEl is already beside target: Do not insert
        if (direction === 0 || sibling === target) {
          return completed(false);
        }
        state.lastTarget = target;
        state.lastDirection = direction;
        var nextSibling = target.nextElementSibling,
          after = false;
        after = direction === 1;
        var moveVector = _onMove(state.rootEl, el, state.dragEl, dragRect, target, targetRect, evt, after);
        if (moveVector !== false) {
          if (moveVector === 1 || moveVector === -1) {
            after = moveVector === 1;
          }
          state._silent = true;
          setTimeout(_unsilent, 30);
          capture();
          if (after && !nextSibling) {
            el.appendChild(state.dragEl);
          } else {
            target.parentNode.insertBefore(state.dragEl, after ? nextSibling : target);
          }

          // Undo chrome's scroll adjustment (has no effect on other browsers)
          if (scrolledPastTop) {
            scrollBy(scrolledPastTop, 0, scrollBefore - scrolledPastTop.scrollTop);
          }
          state.parentEl = state.dragEl.parentNode; // actualization

          // must be done before animation
          if (targetBeforeFirstSwap !== undefined && !state.isCircumstantialInvert) {
            state.targetMoveDistance = Math.abs(targetBeforeFirstSwap - getRect(target)[side1]);
          }
          changed();
          return completed(true);
        }
      }
      if (el.contains(state.dragEl)) {
        return completed(false);
      }
    }
    return false;
  },
  _ignoreWhileAnimating: null,
  _offMoveEvents: function _offMoveEvents() {
    off(document, 'mousemove', this._onTouchMove);
    off(document, 'touchmove', this._onTouchMove);
    off(document, 'pointermove', this._onTouchMove);
    off(document, 'dragover', nearestEmptyInsertDetectEvent);
    off(document, 'mousemove', nearestEmptyInsertDetectEvent);
    off(document, 'touchmove', nearestEmptyInsertDetectEvent);
  },
  _offUpEvents: function _offUpEvents() {
    var ownerDocument = this.el.ownerDocument;
    off(ownerDocument, 'mouseup', this._onDrop);
    off(ownerDocument, 'touchend', this._onDrop);
    off(ownerDocument, 'pointerup', this._onDrop);
    off(ownerDocument, 'pointercancel', this._onDrop);
    off(ownerDocument, 'touchcancel', this._onDrop);
    off(document, 'selectstart', this);
  }
};
export { dragOverMethods };
