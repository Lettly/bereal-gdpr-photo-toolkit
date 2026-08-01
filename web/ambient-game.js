function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function spawnBubble(root, onPop) {
    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "ambient-bubble";
    bubble.setAttribute("aria-label", "Pop background bubble");
    bubble.style.setProperty("--x", `${4 + Math.round(Math.random() * 88)}vw`);
    bubble.style.setProperty("--size", `${58 + Math.round(Math.random() * 36)}px`);
    bubble.style.setProperty("--drift", `${Math.round(Math.random() * 160 - 80)}px`);
    bubble.style.setProperty("--duration", `${6 + Math.random() * 5}s`);
    bubble.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        onPop();
        bubble.remove();
    });
    bubble.addEventListener("animationend", () => bubble.remove());
    root.appendChild(bubble);
}

export function createAmbientGame({ root, status, timer, score }) {
    let startedAt = 0;
    let scoreValue = 0;
    let timerId = null;
    let spawnId = null;

    function updateScore() {
        scoreValue++;
        score.textContent = String(scoreValue);
    }

    function start() {
        startedAt = Date.now();
        scoreValue = 0;
        score.textContent = String(scoreValue);
        timer.textContent = "0:00";
        root.textContent = "";
        root.classList.remove("hidden");
        status.classList.remove("hidden");

        clearInterval(timerId);
        timerId = setInterval(() => {
            timer.textContent = formatElapsed(Date.now() - startedAt);
        }, 1000);

        clearInterval(spawnId);
        spawnBubble(root, updateScore);
        spawnId = setInterval(() => spawnBubble(root, updateScore), 900);
    }

    function stop() {
        clearInterval(timerId);
        clearInterval(spawnId);
        timerId = null;
        spawnId = null;
        root.textContent = "";
        root.classList.add("hidden");
        status.classList.add("hidden");
    }

    return { start, stop };
}
