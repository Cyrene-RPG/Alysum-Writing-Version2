/** Branch-only guard. Keep enabled for every preview of test/editor-manuscript. */
export const IS_EDITOR_TEST = true;

export function blockTestCloudAccess() {
    throw new Error("Cloud access is disabled on the editor test branch. Use local sample books.");
}
