export function applyBugFilter(bugs, filter) {
    let list = bugs.slice();
    if (filter === "open" || filter === "ack" || filter === "fixed") {
        list = list.filter((row) => row.status === filter);
    }
    if (filter === "top") {
        list.sort((a, b) => b.votes - a.votes || b.stub - a.stub);
    } else {
        list.sort((a, b) => b.stub - a.stub);
    }
    return list;
}

export function applySuggestFilter(rows, filter) {
    const list = rows.slice();
    if (filter === "newest") list.sort((a, b) => b.stub - a.stub);
    else list.sort((a, b) => b.votes - a.votes || b.stub - a.stub);
    return list;
}

export function bindFilterBar(root, onChange) {
    if (!root) return;
    root.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-filter]");
        if (!button || !root.contains(button)) return;
        root.querySelectorAll("button").forEach((el) => {
            el.classList.toggle("active", el === button);
        });
        onChange(button.dataset.filter);
    });
}
