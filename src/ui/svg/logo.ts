/**
 * Tendeta mark: a little shop with a scalloped striped awning and a gold coin.
 * The € is drawn with strokes so it never depends on installed fonts.
 * Same artwork as `public/icons/icon.svg`.
 */
export function logoSvg(size = 112): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true" focusable="false">${LOGO_BODY}</svg>`;
}

export const LOGO_BODY = `
  <rect width="512" height="512" rx="112" fill="#1E5AA8"/>
  <g>
    <path d="M56 120h400v86H56z" fill="#FFF6E9"/>
    <path d="M56 120h57v86H56zM170 120h57v86h-57zM284 120h57v86h-57zM398 120h58v86h-58z" fill="#F08A24"/>
    <path d="M56 206a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0a28.5 28.5 0 0 0 57 0z" fill="#F08A24"/>
    <path d="M113 206a28.5 28.5 0 0 0 57 0M227 206a28.5 28.5 0 0 0 57 0M341 206a28.5 28.5 0 0 0 57 0" fill="#FFF6E9"/>
    <rect x="40" y="96" width="432" height="30" rx="15" fill="#C2412D"/>
  </g>
  <rect x="84" y="262" width="344" height="168" rx="18" fill="#FFF6E9" opacity="0.14"/>
  <circle cx="256" cy="352" r="100" fill="#B8860F"/>
  <circle cx="256" cy="344" r="100" fill="#F5C443"/>
  <circle cx="256" cy="344" r="77" fill="none" stroke="#B8860F" stroke-width="8" opacity="0.55"/>
  <path d="M292 302a52 52 0 1 0 0 84" fill="none" stroke="#7A5608" stroke-width="22" stroke-linecap="round"/>
  <path d="M206 330h74M206 360h66" stroke="#7A5608" stroke-width="18" stroke-linecap="round"/>
`;
