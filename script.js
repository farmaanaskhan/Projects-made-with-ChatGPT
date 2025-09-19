const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameOverScreen = document.getElementById('gameOverScreen');
const finalScore = document.getElementById('finalScore');
const newGameButton = document.getElementById('newGameButton');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let score = 0;
let misses = 0;
let gameActive = true;

const bow = {
    x: 150,
    y: canvas.height / 2,
    width: 20,
    height: 150,
    draw() {
        // Draw the bow handle
        ctx.fillStyle = 'brown';
        ctx.fillRect(this.x - 10, this.y - this.height / 2, 10, this.height);

        // Draw the bow curve
        ctx.beginPath();
        ctx.arc(this.x + 10, this.y, this.height / 2, -Math.PI / 2, Math.PI / 2);
        ctx.strokeStyle = 'brown';
        ctx.lineWidth = 5;
        ctx.stroke();
    }
};

const arrow = {
    x: bow.x + 10, // Adjusted to match the bow's new direction
    y: bow.y,
    width: 50,
    height: 5,
    speed: 0,
    active: false,
    draw() {
        if (this.active) {
            ctx.fillStyle = 'black';
            ctx.fillRect(this.x, this.y - this.height / 2, this.width, this.height);
        }
    },
    move() {
        if (this.active) {
            this.x += this.speed;
            if (this.x > canvas.width) {
                this.active = false;
                this.speed = 0;
                misses++;
                checkGameOver();
            }
        }
    }
};

const target = {
    x: canvas.width - 100,
    y: canvas.height / 2,
    radius: 40,
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = 'red';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'red';
        ctx.fill();
    },
    reset() {
        this.y = Math.random() * (canvas.height - this.radius * 2) + this.radius;
    }
};

function detectHit() {
    if (
        arrow.active &&
        arrow.x + arrow.width >= target.x - target.radius &&
        arrow.y >= target.y - target.radius &&
        arrow.y <= target.y + target.radius
    ) {
        score++;
        target.reset();
        arrow.active = false;
        arrow.speed = 0;
    }
}

function checkGameOver() {
    if (misses >= 3) {
        gameActive = false;
        showGameOver();
    }
}

function showGameOver() {
    gameOverScreen.style.display = 'block';
    finalScore.textContent = score;
}

function restartGame() {
    score = 0;
    misses = 0;
    gameActive = true;
    target.reset();
    gameOverScreen.style.display = 'none';
}

window.addEventListener('keydown', (e) => {
    if (!gameActive) return;

    if (e.key === 'ArrowUp' && bow.y - bow.height / 2 > 0) {
        bow.y -= 20;
        if (!arrow.active) arrow.y = bow.y;
    } else if (e.key === 'ArrowDown' && bow.y + bow.height / 2 < canvas.height) {
        bow.y += 20;
        if (!arrow.active) arrow.y = bow.y;
    } else if (e.key === ' ') {
        if (!arrow.active) {
            arrow.active = true;
            arrow.speed = 15;
            arrow.x = bow.x + 10; // Matches the bow's curve edge
            arrow.y = bow.y;
        }
    }
});

newGameButton.addEventListener('click', restartGame);

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameActive) {
        bow.draw();
        target.draw();
        arrow.draw();

        arrow.move();
        detectHit();

        ctx.fillStyle = 'black';
        ctx.font = '20px Arial';
        ctx.fillText(`Score: ${score}`, 20, 30);
        ctx.fillText(`Misses: ${misses}`, 20, 60);
    }

    requestAnimationFrame(gameLoop);
}

target.reset();
gameLoop();
