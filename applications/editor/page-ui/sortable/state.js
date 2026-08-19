export const state = {
  dragEl: undefined,
  parentEl: undefined,
  ghostEl: undefined,
  rootEl: undefined,
  nextEl: undefined,
  lastDownEl: undefined,
  cloneEl: undefined,
  cloneHidden: undefined,
  oldIndex: undefined,
  newIndex: undefined,
  oldDraggableIndex: undefined,
  newDraggableIndex: undefined,
  activeGroup: undefined,
  putSortable: undefined,
  awaitingDragStarted: false,
  ignoreNextClick: false,
  sortables: [],
  tapEvt: undefined,
  touchEvt: undefined,
  lastDx: undefined,
  lastDy: undefined,
  tapDistanceLeft: undefined,
  tapDistanceTop: undefined,
  moved: undefined,
  lastTarget: undefined,
  lastDirection: undefined,
  pastFirstInvertThresh: false,
  isCircumstantialInvert: false,
  targetMoveDistance: undefined,
  ghostRelativeParent: undefined,
  ghostRelativeParentInitialScroll: [],
  _silent: false,
  savedInputChecked: []
};

export const host = {
  Sortable: null
};
