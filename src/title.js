// Title card lettering, drawn once into a canvas and sampled by the final
// universe's shader (which burns it in with ink, embers and light).

export function makeTitleCanvas() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';

  const serif = 'Cinzel, "Trajan Pro", Georgia, serif';
  // red channel: main title
  g.font = `900 250px ${serif}`;
  drawSpaced(g, 'MULTIVERSE', 1024, 470, 18);
  // green channel: small lines
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#00ff00';
  g.font = `600 58px ${serif}`;
  drawSpaced(g, 'INTO  THE', 1024, 290, 26);
  g.font = `500 44px ${serif}`;
  drawSpaced(g, 'A  REAL-TIME  PROCEDURAL  FILM', 1024, 660, 20);
  // blue channel: rule lines
  g.fillStyle = '#0000ff';
  g.fillRect(560, 596, 928, 4);
  g.fillRect(760, 340, 528, 3);
  return c;
}

function drawSpaced(g, text, x, y, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  chars.forEach((ch, i) => {
    g.fillText(ch, cx + widths[i] / 2, y);
    cx += widths[i] + spacing;
  });
}
