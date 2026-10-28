(function (root) {
  function luminance(hex) {
    const values = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  }
  function tokens(value, dark = false) {
    const color = /^#[\da-f]{6}$/i.test(value || '') ? value.toLowerCase() : '#f43f55';
    const l = luminance(color);
    // Keep the selected hue for fills; darken text accents until readable on the light surfaces.
    let ink = color;
    if (dark) {
      while (luminance(ink) < .5) ink = '#' + ink.slice(1).match(/../g).map(v => Math.min(255, Math.ceil(parseInt(v, 16) + (255 - parseInt(v, 16)) * .12)).toString(16).padStart(2, '0')).join('');
    } else while (luminance(ink) > .14) ink = '#' + ink.slice(1).match(/../g).map(v => Math.floor(parseInt(v, 16) * .9).toString(16).padStart(2, '0')).join('');
    return { '--theme': color, '--red': ink, '--red-soft': color + '12', '--theme-border': color + '40', '--theme-shadow': color + '30', '--on-theme': l > .179 ? '#000000' : '#ffffff' };
  }
  const api = { tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BanCiTheme = api;
})(globalThis);
