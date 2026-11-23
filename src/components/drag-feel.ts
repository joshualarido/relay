import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

/** One easing for every drag in the app: items glide aside and settle, never snap. */
export const DRAG_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Sortable neighbours ease out of the way while you drag. */
export const SORT_TRANSITION = { duration: 260, easing: DRAG_EASE };

/** The ghost glides into its slot on drop while the silhouette fades back in. */
export const DROP_ANIMATION: DropAnimation = {
  duration: 240,
  easing: DRAG_EASE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "1" } } }),
};

/** Keep the silhouette's opacity easing alongside dnd-kit's inline transform transition. */
export function withFade(transition: string | undefined): string {
  const fade = `background-color 220ms ${DRAG_EASE}, border-color 220ms ${DRAG_EASE}`;
  return transition ? `${transition}, ${fade}` : fade;
}
