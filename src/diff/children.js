import { diff, unmount, applyRef } from './index';
import { createVNode, Fragment } from '../create-element';
import { EMPTY_OBJ, EMPTY_ARR, EMPTY_VNODE } from '../constants';
import { isArray } from '../util';
import { getDomSibling } from '../component';

export const diffChildren = diffChildren2;

/**
 * Diff the children of a virtual node
 * @param {import('../internal').PreactElement} parentDom The DOM element whose
 * children are being diffed
 * @param {import('../internal').ComponentChildren[]} renderResult
 * @param {import('../internal').VNode} newParentVNode The new virtual
 * node whose children should be diff'ed against oldParentVNode
 * @param {import('../internal').VNode} oldParentVNode The old virtual
 * node whose children should be diff'ed against newParentVNode
 * @param {object} globalContext The current context object - modified by getChildContext
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<import('../internal').PreactElement>} excessDomChildren
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').PreactElement} oldDom The current attached DOM
 * element any new dom elements should be placed around. Likely `null` on first
 * render (except when hydrating). Can be a sibling DOM element when diffing
 * Fragments that have siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {Array<any>} refQueue an array of elements needed to invoke refs
 */
// eslint-disable-next-line no-unused-vars
function diffChildren1(
	parentDom,
	renderResult,
	newParentVNode,
	oldParentVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	oldDom,
	isHydrating,
	refQueue
) {
	let i,
		j,
		oldVNode,
		childVNode,
		newDom,
		firstChildDom,
		skew = 0;

	// This is a compression of oldParentVNode!=null && oldParentVNode != EMPTY_OBJ && oldParentVNode._children || EMPTY_ARR
	// as EMPTY_OBJ._children should be `undefined`.
	let oldChildren = (oldParentVNode && oldParentVNode._children) || EMPTY_ARR;

	let oldChildrenLength = oldChildren.length,
		remainingOldChildren = oldChildrenLength,
		newChildrenLength = renderResult.length;

	newParentVNode._children = [];
	for (i = 0; i < newChildrenLength; i++) {
		childVNode = renderResult[i];

		if (
			childVNode == null ||
			typeof childVNode == 'boolean' ||
			typeof childVNode == 'function'
		) {
			childVNode = newParentVNode._children[i] = null;
		}
		// If this newVNode is being reused (e.g. <div>{reuse}{reuse}</div>) in the same diff,
		// or we are rendering a component (e.g. setState) copy the oldVNodes so it can have
		// it's own DOM & etc. pointers
		else if (
			// TODO: To make TS happy, I've added this check, but it's not necessary. Remove
			typeof childVNode == 'string' ||
			childVNode.constructor == String ||
			typeof childVNode == 'number' ||
			// eslint-disable-next-line valid-typeof
			typeof childVNode == 'bigint'
		) {
			childVNode = newParentVNode._children[i] = createVNode(
				null,
				childVNode,
				null,
				null,
				childVNode
			);
		} else if (isArray(childVNode)) {
			childVNode = newParentVNode._children[i] = createVNode(
				Fragment,
				{ children: childVNode },
				null,
				null,
				null
			);
		} else if (childVNode._depth > 0) {
			// VNode is already in use, clone it. This can happen in the following
			// scenario:
			//   const reuse = <div />
			//   <div>{reuse}<span />{reuse}</div>
			childVNode = newParentVNode._children[i] = createVNode(
				childVNode.type,
				childVNode.props,
				childVNode.key,
				childVNode.ref ? childVNode.ref : null,
				childVNode._original
			);
		} else {
			childVNode = newParentVNode._children[i] = childVNode;
		}

		// Terser removes the `continue` here and wraps the loop body
		// in a `if (childVNode) { ... } condition
		if (childVNode == null) {
			oldVNode = oldChildren[i];
			if (oldVNode && oldVNode.key == null && oldVNode._dom) {
				if (oldVNode._dom == oldDom) {
					oldVNode._parent = oldParentVNode;
					oldDom = getDomSibling(oldVNode);
				}

				unmount(oldVNode, oldVNode, false);
				oldChildren[i] = null;
			}

			continue;
		}

		childVNode._parent = newParentVNode;
		childVNode._depth = newParentVNode._depth + 1;

		let skewedIndex = i + skew;
		const matchingIndex = findMatchingIndex(
			childVNode,
			oldChildren,
			skewedIndex,
			remainingOldChildren
		);

		if (matchingIndex === -1) {
			oldVNode = EMPTY_OBJ;
		} else {
			oldVNode = oldChildren[matchingIndex] || EMPTY_OBJ;
			oldChildren[matchingIndex] = undefined;
			remainingOldChildren--;
		}

		// Morph the old element into the new one, but don't append it to the dom yet
		diff(
			parentDom,
			childVNode,
			oldVNode,
			globalContext,
			isSvg,
			excessDomChildren,
			commitQueue,
			oldDom,
			isHydrating,
			refQueue
		);

		newDom = childVNode._dom;
		if ((j = childVNode.ref) && oldVNode.ref != j) {
			if (oldVNode.ref) {
				applyRef(oldVNode.ref, null, childVNode);
			}
			refQueue.push(j, childVNode._component || newDom, childVNode);
		}

		if (newDom != null) {
			if (firstChildDom == null) {
				firstChildDom = newDom;
			}

			let isMounting = oldVNode === EMPTY_OBJ || oldVNode._original === null;
			if (isMounting) {
				if (matchingIndex == -1) {
					skew--;
				}
			} else if (matchingIndex !== skewedIndex) {
				if (matchingIndex === skewedIndex + 1) {
					skew++;
				} else if (matchingIndex > skewedIndex) {
					if (remainingOldChildren > newChildrenLength - skewedIndex) {
						skew += matchingIndex - skewedIndex;
					} else {
						// ### Change from keyed: I think this was missing from the algo...
						skew--;
					}
				} else if (matchingIndex < skewedIndex) {
					if (matchingIndex == skewedIndex - 1) {
						skew = matchingIndex - skewedIndex;
					} else {
						skew = 0;
					}
				} else {
					skew = 0;
				}
			}

			skewedIndex = i + skew;

			if (
				typeof childVNode.type == 'function' &&
				(matchingIndex !== skewedIndex ||
					oldVNode._children === childVNode._children)
			) {
				oldDom = reorderChildren(childVNode, oldDom, parentDom);
			} else if (
				typeof childVNode.type != 'function' &&
				(matchingIndex !== skewedIndex || isMounting)
			) {
				oldDom = placeChild(parentDom, newDom, oldDom);
			} else if (childVNode._nextDom !== undefined) {
				// Only Fragments or components that return Fragment like VNodes will
				// have a non-undefined _nextDom. Continue the diff from the sibling
				// of last DOM child of this child VNode
				oldDom = childVNode._nextDom;

				// Eagerly cleanup _nextDom. We don't need to persist the value because
				// it is only used by `diffChildren` to determine where to resume the diff after
				// diffing Components and Fragments. Once we store it the nextDOM local var, we
				// can clean up the property
				childVNode._nextDom = undefined;
			} else {
				oldDom = newDom.nextSibling;
			}

			if (typeof newParentVNode.type == 'function') {
				// Because the newParentVNode is Fragment-like, we need to set it's
				// _nextDom property to the nextSibling of its last child DOM node.
				//
				// `oldDom` contains the correct value here because if the last child
				// is a Fragment-like, then oldDom has already been set to that child's _nextDom.
				// If the last child is a DOM VNode, then oldDom will be set to that DOM
				// node's nextSibling.
				newParentVNode._nextDom = oldDom;
			}
		}
	}

	newParentVNode._dom = firstChildDom;

	// Remove remaining oldChildren if there are any.
	for (i = oldChildrenLength; i--; ) {
		if (oldChildren[i] != null) {
			if (
				typeof newParentVNode.type == 'function' &&
				oldChildren[i]._dom != null &&
				oldChildren[i]._dom == newParentVNode._nextDom
			) {
				// If the newParentVNode.__nextDom points to a dom node that is about to
				// be unmounted, then get the next sibling of that vnode and set
				// _nextDom to it

				newParentVNode._nextDom = oldChildren[i]._dom.nextSibling;
			}

			unmount(oldChildren[i], oldChildren[i]);
		}
	}
}

/**
 * Diff the children of a virtual node
 * @param {import('../internal').PreactElement} parentDom The DOM element whose
 * children are being diffed
 * @param {import('../internal').ComponentChildren[]} renderResult
 * @param {import('../internal').VNode} newParentVNode The new virtual
 * node whose children should be diff'ed against oldParentVNode
 * @param {import('../internal').VNode} oldParentVNode The old virtual
 * node whose children should be diff'ed against newParentVNode
 * @param {object} globalContext The current context object - modified by getChildContext
 * @param {boolean} isSvg Whether or not this DOM node is an SVG node
 * @param {Array<import('../internal').PreactElement>} excessDomChildren
 * @param {Array<import('../internal').Component>} commitQueue List of components
 * which have callbacks to invoke in commitRoot
 * @param {import('../internal').PreactElement} oldDom The current attached DOM
 * element any new dom elements should be placed around. Likely `null` on first
 * render (except when hydrating). Can be a sibling DOM element when diffing
 * Fragments that have siblings. In most cases, it starts out as `oldChildren[0]._dom`.
 * @param {boolean} isHydrating Whether or not we are in hydration
 * @param {Array<any>} refQueue an array of elements needed to invoke refs
 */
// eslint-disable-next-line no-unused-vars
function diffChildren2(
	parentDom,
	renderResult,
	newParentVNode,
	oldParentVNode,
	globalContext,
	isSvg,
	excessDomChildren,
	commitQueue,
	oldDom,
	isHydrating,
	refQueue
) {
	let i, j, childVNode, newDom, firstChildDom;

	// This is a compression of oldParentVNode!=null && oldParentVNode != EMPTY_VNODE && oldParentVNode._children || EMPTY_ARR
	// as EMPTY_VNODE._children should be `undefined`.
	let oldChildren = (oldParentVNode && oldParentVNode._children) || EMPTY_ARR;

	let oldChildrenLength = oldChildren.length,
		newChildrenLength = renderResult.length;

	// TODO: Is there a better way to track oldDom then a ref? Since
	// constructNewChildrenArray can unmount DOM nodes while looping (to handle
	// null placeholders, i.e. VNode => null in unkeyed children), we need to adjust
	// oldDom in that method.
	const oldDomRef = { current: oldDom };
	const newChildren = (newParentVNode._children = constructNewChildrenArray(
		newParentVNode,
		renderResult,
		oldChildren,
		oldDomRef
	));

	oldDom = oldDomRef.current;

	// Remove remaining oldChildren if there are any. Loop forwards so that as we
	// unmount DOM from the beginning of the oldChildren, we can adjust oldDom to
	// point to the next child.
	for (i = 0; i < oldChildrenLength; i++) {
		if (oldChildren[i] != null && !oldChildren[i]._matched) {
			if (oldDom == oldChildren[i]._dom) {
				oldDom = getDomSibling(oldChildren[i]);
			}

			unmount(oldChildren[i], oldChildren[i]);
		}
	}

	for (let i = 0; i < newChildrenLength; i++) {
		childVNode = newChildren[i];

		if (
			childVNode == null ||
			typeof childVNode == 'boolean' ||
			typeof childVNode == 'function'
		) {
			continue;
		}

		diff(
			parentDom,
			childVNode,
			childVNode._prevVNode,
			globalContext,
			isSvg,
			excessDomChildren,
			commitQueue,
			oldDom,
			isHydrating,
			refQueue
		);

		// Adjust DOM nodes
		newDom = childVNode._dom;
		if ((j = childVNode.ref) && childVNode._prevVNode.ref != j) {
			if (childVNode._prevVNode.ref) {
				applyRef(childVNode._prevVNode.ref, null, childVNode);
			}
			refQueue.push(j, childVNode._component || newDom, childVNode);
		}

		if (newDom != null) {
			if (firstChildDom == null) {
				firstChildDom = newDom;
			}

			// TODO: Golf this `if` block
			if (
				childVNode._insert ||
				(typeof childVNode.type == 'function' &&
					childVNode._children === childVNode._prevVNode._children)
			) {
				if (typeof childVNode.type == 'function') {
					oldDom = reorderChildren(childVNode, oldDom, parentDom);
				} else {
					oldDom = placeChild(parentDom, newDom, oldDom);
				}
			} else if (childVNode._nextDom !== undefined) {
				// Only Fragments or components that return Fragment like VNodes will
				// have a non-undefined _nextDom. Continue the diff from the sibling
				// of last DOM child of this child VNode
				oldDom = childVNode._nextDom;

				// Eagerly cleanup _nextDom. We don't need to persist the value because
				// it is only used by `diffChildren` to determine where to resume the diff after
				// diffing Components and Fragments. Once we store it the nextDOM local var, we
				// can clean up the property
				// TODO: Should we always set this to undefined to ensure it is cleaned up?
				childVNode._nextDom = undefined;
			} else {
				oldDom = newDom.nextSibling;
			}

			// TODO: With new child diffing algo, consider alt ways to diff Fragments.
			// Such as dropping oldDom and moving fragments in place
			if (typeof newParentVNode.type == 'function') {
				// Because the newParentVNode is Fragment-like, we need to set it's
				// _nextDom property to the nextSibling of its last child DOM node.
				//
				// `oldDom` contains the correct value here because if the last child
				// is a Fragment-like, then oldDom has already been set to that child's _nextDom.
				// If the last child is a DOM VNode, then oldDom will be set to that DOM
				// node's nextSibling.
				newParentVNode._nextDom = oldDom;
			}
		}

		// Unset diffing properties
		childVNode._prevVNode = null;
		childVNode._insert = false;
		childVNode._matched = false;
	}

	newParentVNode._dom = firstChildDom;
}

/**
 * @param {import('../internal').VNode} newParentVNode
 * @param {import('../internal').ComponentChildren[]} renderResult
 * @param {import('../internal').VNode[]} oldChildren
 * @param {{ current: import('../internal').PreactElement }} oldDomRef
 * @returns {import('../internal').VNode[]}
 */
function constructNewChildrenArray(
	newParentVNode,
	renderResult,
	oldChildren,
	oldDomRef
) {
	/** @type {number} */
	let i;
	/** @type {import('../internal').VNode} */
	let childVNode;
	/** @type {import('../internal').VNode} */
	let oldVNode;
	let newChildrenLength = renderResult.length;
	let remainingOldChildren = oldChildren.length;
	let skew = 0;

	const newChildren = [];
	for (i = 0; i < renderResult.length; i++) {
		childVNode = /** @type {import('../internal').VNode} */ (renderResult[i]);

		// Convert render results to VNodes (e.g. strings => VNodes, etc.)
		if (
			childVNode == null ||
			typeof childVNode == 'boolean' ||
			typeof childVNode == 'function'
		) {
			childVNode = newChildren[i] = null;
		}
		// If this newVNode is being reused (e.g. <div>{reuse}{reuse}</div>) in the same diff,
		// or we are rendering a component (e.g. setState) copy the oldVNodes so it can have
		// it's own DOM & etc. pointers
		else if (
			// TODO: To make TS happy, I've added this check, but it's not necessary. Remove
			typeof childVNode == 'string' ||
			childVNode.constructor == String ||
			typeof childVNode == 'number' ||
			// eslint-disable-next-line valid-typeof
			typeof childVNode == 'bigint'
		) {
			childVNode = newChildren[i] = createVNode(
				null,
				childVNode,
				null,
				null,
				childVNode
			);
		} else if (isArray(childVNode)) {
			childVNode = newChildren[i] = createVNode(
				Fragment,
				{ children: childVNode },
				null,
				null,
				null
			);
		} else if (childVNode._depth > 0) {
			// VNode is already in use, clone it. This can happen in the following
			// scenario:
			//   const reuse = <div />
			//   <div>{reuse}<span />{reuse}</div>
			childVNode = newChildren[i] = createVNode(
				childVNode.type,
				childVNode.props,
				childVNode.key,
				childVNode.ref ? childVNode.ref : null,
				childVNode._original
			);
		} else {
			childVNode = newChildren[i] = childVNode;
		}

		// Handle unmounting null placeholders, i.e. VNode => null in unkeyed children
		if (childVNode == null) {
			oldVNode = oldChildren[i];
			if (oldVNode && oldVNode.key == null && oldVNode._dom) {
				if (oldVNode._dom == oldDomRef.current) {
					// oldVNode._parent = oldParentVNode;
					oldDomRef.current = getDomSibling(oldVNode);
				}

				unmount(oldVNode, oldVNode, false);

				// Explicitly nullify this position in oldChildren instead of just
				// setting `_match=true` to prevent other routines (e.g.
				// `findMatchingIndex` or `getDomSibling`) from thinking VNodes or DOM
				// nodes in this position are still available to be used in diffing when
				// they have actually already been unmounted. For example, by only
				// setting `_match=true` here, the unmounting loop later would attempt
				// to unmount this VNode again seeing `_match==true`.  Further,
				// getDomSibling doesn't know about _match and so would incorrectly
				// assume DOM nodes in this subtree are mounted and usable.
				oldChildren[i] = null;
				remainingOldChildren--;
			}

			continue;
		}

		childVNode._parent = newParentVNode;
		childVNode._depth = newParentVNode._depth + 1;
		childVNode._index = i;

		let skewedIndex = i + skew;
		const matchingIndex = findMatchingIndex(
			childVNode,
			oldChildren,
			skewedIndex,
			remainingOldChildren
		);

		if (matchingIndex === -1) {
			oldVNode = EMPTY_VNODE;
		} else if (matchingIndex !== -1) {
			// Mark oldVNode as matched so it isn't unmounted
			oldVNode = oldChildren[matchingIndex] || EMPTY_VNODE;
			if (oldVNode !== EMPTY_VNODE) {
				oldVNode._matched = true;
			}
			remainingOldChildren--;
		}

		childVNode._prevVNode = oldVNode;

		// Here, we define isMounting for the purposes of the skew diffing
		// algorithm. Nodes that are unsuspending are considered mounting and we detect
		// this by checking if oldVNode._original == null
		let isMounting = oldVNode === EMPTY_VNODE || oldVNode._original === null;
		if (isMounting) {
			if (matchingIndex == -1) {
				skew--;
			}
		} else if (matchingIndex !== skewedIndex) {
			if (matchingIndex === skewedIndex + 1) {
				skew++;
			} else if (matchingIndex > skewedIndex) {
				if (remainingOldChildren > newChildrenLength - skewedIndex) {
					skew += matchingIndex - skewedIndex;
				} else {
					// ### Change from keyed: I think this was missing from the algo...
					skew--;
				}
			} else if (matchingIndex < skewedIndex) {
				if (matchingIndex == skewedIndex - 1) {
					skew = matchingIndex - skewedIndex;
				} else {
					skew = 0;
				}
			} else {
				skew = 0;
			}
		}

		skewedIndex = i + skew;
		childVNode._insert =
			matchingIndex !== skewedIndex ||
			(typeof childVNode.type != 'function' && isMounting);
	}

	return newChildren;
}

function reorderChildren(childVNode, oldDom, parentDom) {
	// Note: VNodes in nested suspended trees may be missing _children.
	let c = childVNode._children;

	let tmp = 0;
	for (; c && tmp < c.length; tmp++) {
		let vnode = c[tmp];
		if (vnode) {
			// We typically enter this code path on sCU bailout, where we copy
			// oldVNode._children to newVNode._children. If that is the case, we need
			// to update the old children's _parent pointer to point to the newVNode
			// (childVNode here).
			vnode._parent = childVNode;

			if (typeof vnode.type == 'function') {
				oldDom = reorderChildren(vnode, oldDom, parentDom);
			} else {
				oldDom = placeChild(parentDom, vnode._dom, oldDom);
			}
		}
	}

	return oldDom;
}

/**
 * Flatten and loop through the children of a virtual node
 * @param {import('../index').ComponentChildren} children The unflattened
 * children of a virtual node
 * @returns {import('../internal').VNode[]}
 */
export function toChildArray(children, out) {
	out = out || [];
	if (children == null || typeof children == 'boolean') {
	} else if (isArray(children)) {
		children.some(child => {
			toChildArray(child, out);
		});
	} else {
		out.push(children);
	}
	return out;
}

function placeChild(parentDom, newDom, oldDom) {
	if (oldDom == null || oldDom.parentNode !== parentDom) {
		parentDom.insertBefore(newDom, null);
	} else if (newDom != oldDom || newDom.parentNode == null) {
		parentDom.insertBefore(newDom, oldDom);
	}

	return newDom.nextSibling;
}

/**
 * @param {import('../internal').VNode | string} childVNode
 * @param {import('../internal').VNode[]} oldChildren
 * @param {number} skewedIndex
 * @param {number} remainingOldChildren
 * @returns {number}
 */
function findMatchingIndex(
	childVNode,
	oldChildren,
	skewedIndex,
	remainingOldChildren
) {
	const key = childVNode.key;
	const type = childVNode.type;
	let x = skewedIndex - 1;
	let y = skewedIndex + 1;
	let oldVNode = oldChildren[skewedIndex];
	// We only need to perform a search if there are more children
	// (remainingOldChildren) to search. However, if the oldVNode we just looked
	// at skewedIndex was not already used in this diff, then there must be at
	// least 1 other (so greater than 1) remainingOldChildren to attempt to match
	// against. So the following condition checks that ensuring
	// remainingOldChildren > 1 if the oldVNode is not already used/matched. Else
	// if the oldVNode was null or matched, then there could needs to be at least
	// 1 (aka `remainingOldChildren > 0`) children to find and compare against.
	let shouldSearch =
		remainingOldChildren > (oldVNode != null && !oldVNode._matched ? 1 : 0);

	if (
		oldVNode === null ||
		(oldVNode && key == oldVNode.key && type === oldVNode.type)
	) {
		return skewedIndex;
	} else if (shouldSearch) {
		while (x >= 0 || y < oldChildren.length) {
			if (x >= 0) {
				oldVNode = oldChildren[x];
				if (
					oldVNode &&
					!oldVNode._matched &&
					key == oldVNode.key &&
					type === oldVNode.type
				) {
					return x;
				}
				x--;
			}

			if (y < oldChildren.length) {
				oldVNode = oldChildren[y];
				if (
					oldVNode &&
					!oldVNode._matched &&
					key == oldVNode.key &&
					type === oldVNode.type
				) {
					return y;
				}
				y++;
			}
		}
	}

	return -1;
}
