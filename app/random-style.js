(function applyRandomBackground() {
  const hue = Math.floor(Math.random() * 360);
  const color = `hsl(${hue}, 100%, 91%)`;

  document.body.style.backgroundColor = color;
})();
