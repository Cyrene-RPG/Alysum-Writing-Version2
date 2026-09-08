export function makeAnonCheck() {
    const label = document.createElement("label");
    label.className = "anon-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    const text = document.createElement("span");
    text.textContent = "anonymous";
    label.append(input, text);
    return { label, input };
}
