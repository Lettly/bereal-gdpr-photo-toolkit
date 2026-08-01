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
        if (onPop()) bubble.remove();
    });
    bubble.addEventListener("animationend", () => bubble.remove());
    root.appendChild(bubble);
}

export function createAmbientGame({ root, status, timer, score, pauseButton }) {
    let startedAt = 0;
    let elapsedBeforePause = 0;
    let scoreValue = 0;
    let timerId = null;
    let spawnId = null;
    let isRunning = false;
    let isPaused = false;

    function updateScore() {
        if (isPaused) return false;
        scoreValue++;
        score.textContent = String(scoreValue);
        return true;
    }

    function elapsedMs() {
        return elapsedBeforePause + (isPaused ? 0 : Date.now() - startedAt);
    }

    function updateTimer() {
        timer.textContent = formatElapsed(elapsedMs());
    }

    function startTimers() {
        clearInterval(timerId);
        timerId = setInterval(updateTimer, 1000);

        clearInterval(spawnId);
        spawnBubble(root, updateScore);
        spawnId = setInterval(() => spawnBubble(root, updateScore), 900);
    }

    function setPaused(paused) {
        if (!isRunning || isPaused === paused) return;

        if (paused) {
            elapsedBeforePause = elapsedMs();
            clearInterval(timerId);
            clearInterval(spawnId);
            timerId = null;
            spawnId = null;
        }

        isPaused = paused;
        pauseButton.setAttribute("aria-pressed", String(paused));
        pauseButton.textContent = paused ? "Resume game" : "Pause game";
        root.classList.toggle("ambient-game-paused", paused);

        if (paused) {
            updateTimer();
        } else {
            startedAt = Date.now();
            startTimers();
        }
    }

    function start() {
        isRunning = true;
        isPaused = false;
        startedAt = Date.now();
        elapsedBeforePause = 0;
        scoreValue = 0;
        score.textContent = String(scoreValue);
        timer.textContent = "0:00";
        pauseButton.textContent = "Pause game";
        pauseButton.setAttribute("aria-pressed", "false");
        root.textContent = "";
        root.classList.remove("ambient-game-paused");
        root.classList.remove("hidden");
        status.classList.remove("hidden");

        startTimers();
    }

    function stop() {
        isRunning = false;
        isPaused = false;
        clearInterval(timerId);
        clearInterval(spawnId);
        timerId = null;
        spawnId = null;
        pauseButton.textContent = "Pause game";
        pauseButton.setAttribute("aria-pressed", "false");
        root.textContent = "";
        root.classList.remove("ambient-game-paused");
        root.classList.add("hidden");
        status.classList.add("hidden");
    }

    pauseButton.addEventListener("click", () => setPaused(!isPaused));

    return { start, stop };
}
