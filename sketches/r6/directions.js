/* Round 6: mixing round 5's Swell Tide, Swell Stars, Radiant Specimens and
   Radiant Bloom (lines into the centre, shapes of every size, stars, specimens
   in the largest beads), then drawing the result in a range of styles.
   Geometry and style are separate: each composition builds a list of items,
   and each style decides how an item is drawn. */
(function () {
  const { TAU, O, E, ovalR, ovalPath } = window.GL;
  const { HAIR, on, open, close, circle, shapePath, design, growTracks } = window.KIT;
  const { beadPath, sequence, penRim } = window.STRANDS;

  const { STARRY, DESIGNS, radiant, sizing, orbit, radial, toItems, specShape, itemPath, moved, R_of, specDesign, lineOf, STYLE, render, COMP } = window.RADIANT;

  function make(comp, style, spec, nodes, extra = {}) {
    return (ctx, r, nz, env) => {
      const P = open(ctx, r, env);
      const lines = COMP[comp](r, nz);
      const items = toItems(r, P, lines, { spec, nodes, ...extra });
      const S = render(ctx, r, nz, P, items, lines, style);
      // The rim follows whatever ground the style painted.
      if (extra.pen) { ctx.restore(); penRim(ctx, r, nz, P); } else close(ctx, { ...P, field: S.ground ?? S.field, ink: style === 'riso' ? '#111111' : S.ink });
    };
  }

  window.SETS = {
    'Tide Radiant': 'Spokes into the centre, with bead size set by both a swell along each spoke and a tide across the oval. Shown in four styles.',
    Swirl: 'The tide spokes twisted into spiral arms.',
    Converge: 'Dense swelling strands pulled toward the centre, growing toward the rim. No spokes; they pack and squeeze like Swell.',
    Bloom: 'From pinpricks at the centre to large specimens at the rim.',
    'Off-centre & Rays': 'The point of convergence moved off centre, and spokes crossed by orbiting strands.',
  };

  const D = (set, name, comp, style, rule, data, spec, nodes, extra) => ({ set, name, from: `${comp} · ${style}`, rule, data, draw: make(comp, style, spec, nodes, extra) });
  const DIRECTIONS = [
    D('Tide Radiant', 'Tide Radiant', 'tide', 'flat',
      'Radiant Specimens meets Swell Tide. Spokes of circles, stars and lenses run into the centre, big beads gather in tidal patches, and the largest open into specimens.',
      'bead sequence per spoke, with size as a second channel.', 16, 0.03),
    D('Tide Radiant', 'Line Radiant', 'tide', 'line',
      'The same system as pure line. Every shape is an outline in its own colour, so the complexity comes through as drawing rather than fill.',
      'shape sequence per spoke.', 16, 0.03),
    D('Tide Radiant', 'Woodcut Radiant', 'tide', 'hatch',
      'Every shape cut with parallel lines whose angle turns from strand to strand, like a woodblock print.',
      'hatch angle per spoke as an extra channel.', 999, 0.02),
    D('Tide Radiant', 'Collage Radiant', 'tide', 'flat',
      'One composition, many hands. Each spoke is drawn in its own style (flat, line, halftone, stipple or hatched) so styles braid together into the centre.',
      'style per spoke as a channel.', 16, 0.03, { collage: true }),
    D('Swirl', 'Riso Swirl', 'swirl', 'riso',
      'Spiral arms printed in two or three fluorescent riso inks. Each arm takes one ink, and the layers sit slightly off register so overlaps mix into new colours.',
      'ink per arm, with shape sequences along each.', 999, 0.02),
    D('Swirl', 'Blueprint Swirl', 'swirl', 'blueprint',
      'White hairline on a deep ground, like a technical drawing of the spiral. Only the stars and a few beads are lit in the accent.',
      'the lit beads as a sparse, high-contrast code.', 18, 0.02),
    D('Converge', 'Converge', 'converge', 'flat',
      'Dense, swelling strands of every shape pulled toward the centre, tiny at the core and large near the rim, with the peaks opening into specimens.',
      'sequences along the converging strands.', 19, 0.01),
    D('Converge', 'Cut-paper Converge', 'converge', 'cutout',
      'The converging strands as paper cut-outs: solid shapes on a solid ground, no outlines, and designs cut back out of the specimens.',
      'shape silhouettes only, the cleanest to scan.', 19, 0.01),
    D('Bloom', 'Shadow Bloom', 'bloom', 'shadow',
      'Bloom growth with every shape casting the same hard shadow, like stacked paper or a pop-up. The large rim specimens stand off the page.',
      'rim specimens as the main track.', 20, 0.04),
    D('Bloom', 'Halftone Bloom', 'bloom', 'halftone',
      'Every shape filled with a halftone dot screen, dots scaled to the shape, like an old offset print of the bloom.',
      'dot density per shape as a tone channel.', 999, 0.03),
    D('Off-centre & Rays', 'Pen Off-centre', 'eccentric', 'pen',
      'The spokes converge on a point away from the centre. Drawn by hand: fills slip off register and outlines are traced twice, with a pen rim.',
      'the off-centre point as orientation.', 18, 0.03, { pen: true }),
    D('Off-centre & Rays', 'Stipple Rays', 'rays', 'stipple',
      'Sparse spokes crossed by orbiting, tide-sized strands, all filled with stippled dots in their colour.',
      'rings and rays as two axes.', 999, 0.02),
  ];

  // Collage: swap in a different style per spoke for the one option that asks for it.
  const collage = DIRECTIONS.find((d) => d.name === 'Collage Radiant');
  collage.draw = (ctx, r, nz, env) => {
    const P = open(ctx, r, env);
    const lines = COMP.tide(r, nz), items = toItems(r, P, lines, { spec: 16, nodes: 0.03 });
    const styles = ['flat', 'line', 'halftone', 'stipple', 'hatch'], S = { ...P };
    if (r.chance(0.5)) { ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.beginPath(); for (const ln of lines) ln.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.stroke(); }
    const pick = lines.map(() => r.pick(styles));
    for (const it of items) STYLE[pick[it.g]].item(ctx, r, nz, S, it);
    close(ctx, P);
  };

  window.DIRECTIONS = DIRECTIONS;
})();
