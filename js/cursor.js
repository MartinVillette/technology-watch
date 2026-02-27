const cursor = document.createElement('div');
cursor.id = 'cursor-dot';
document.body.appendChild(cursor);

const style = document.createElement('style');
style.textContent = `
  #cursor-dot {
    position: fixed;
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    transition: transform 0.1s ease, opacity 0.3s ease;
    box-shadow: 0 0 12px 2px rgba(255,255,255,0.6);
  }
`;
document.head.appendChild(style);

let mouseX = 0, mouseY = 0;
let dotX = 0,   dotY = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function loop() {
  // Smooth lag follow
  dotX += (mouseX - dotX) * 0.12;
  dotY += (mouseY - dotY) * 0.12;

  cursor.style.left = dotX + 'px';
  cursor.style.top  = dotY + 'px';

  requestAnimationFrame(loop);
}
loop();