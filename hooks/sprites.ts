// Voxel Clawd in a fantasy-party outfit: a 40×34 isometric block, one role per
// agent type. The face shows how the agent is doing: open eyes while it runs,
// closed when done, crossed when it failed, asleep once the whole party is
// done, and a warning light once its context runs high.

export type Mood = 'focus' | 'happy' | 'dizzy' | 'sleep'

const CLAY = '#D97757'
const LIT = '#EE9E80'
const SHADE = '#B85E43'
const INK = '#1F1A18'
const WARN = '#F2A33A'
const WOOD = '#8A5A2B'

const COSTUME_COLOR: Record<string, string> = {
  ranger: '#5E9E45',
  wizard: '#8A6FE0',
  knight: '#9AA3B2',
  bard: '#5FBF8F',
  alchemist: '#E0609E',
  squire: '#E39B2D',
}

const TYPE_COSTUME: Record<string, string> = {
  Explore: 'ranger',
  Plan: 'wizard',
  'general-purpose': 'knight',
  'claude-code-guide': 'bard',
  'statusline-setup': 'alchemist',
}

export const costumeOf = (type: string): string => TYPE_COSTUME[type.replace(/^[^:]*:/, '')] ?? 'squire'
export const costumeColor = (costume: string): string => COSTUME_COLOR[costume] ?? COSTUME_COLOR.squire ?? CLAY
export const roleName = (costume: string): string => costume.charAt(0).toUpperCase() + costume.slice(1)

// Periods divide one second: a running row redraws each second, which restarts them in phase.
export const SPRITE_CSS = `<style>
.vx *{transform-box:fill-box}
.run .la{animation:hop .5s steps(1) infinite}.run .lb{animation:hop .5s steps(1) infinite -.25s}
@keyframes hop{50%{transform:translateY(-1px)}}
.run .bd{animation:bob .5s steps(1) infinite -.125s}@keyframes bob{50%{transform:translateY(.6px)}}
.run .blink{animation:bl .5s steps(1) infinite}@keyframes bl{50%{opacity:.2}}
.run .turn{transform-origin:0 100%;animation:tn .5s ease-in-out infinite}@keyframes tn{50%{transform:rotate(-25deg)}}
.run .sway{transform-origin:50% 100%;animation:sw 1s ease-in-out infinite}@keyframes sw{25%{transform:rotate(-10deg)}75%{transform:rotate(10deg)}}
.run .strum{transform-origin:30% 70%;animation:st .5s steps(1) infinite}@keyframes st{50%{transform:rotate(-4deg)}}
.run .note{animation:nt 1s linear infinite}@keyframes nt{0%{transform:translate(0,3px);opacity:0}30%{opacity:1}100%{transform:translate(2px,-4px);opacity:0}}
.zz{animation:zz 1s steps(2) infinite}@keyframes zz{50%{opacity:.35}}
.warn{animation:bl .5s steps(1) infinite}
@media (prefers-reduced-motion: reduce){.vx *{animation:none!important}}
</style>`

// The block: lit top, front face, shaded side, two arms, four legs.
const leg = (x: number) => `<rect x="${x}" y="27" width="3" height="4.5" fill="${SHADE}"/><rect x="${x}" y="27" width="1.2" height="4.5" fill="${CLAY}"/>`
const BLOCK = `<polygon points="7,10 29,10 35,5 13,5" fill="${LIT}"/>
<polygon points="29,10 35,5 35,23 29,28" fill="${SHADE}"/>
<rect x="7" y="10" width="22" height="18" fill="${CLAY}"/>
<rect x="3" y="15" width="4" height="5" fill="${CLAY}"/><polygon points="35,13 38,11 38,16 35,18" fill="${SHADE}"/>`

const CLOSED = `<rect x="11.5" y="19.5" width="4" height="1.4" fill="${INK}"/><rect x="18.5" y="19.5" width="4" height="1.4" fill="${INK}"/>`
const face = (mood: Mood): string => {
  if (mood === 'happy' || mood === 'sleep') return CLOSED
  if (mood === 'dizzy') return [13.5, 20.5].map(x => `<path d="M${x - 1.6} 18.4l3.2 3.2M${x + 1.6} 18.4l-3.2 3.2" stroke="${INK}" stroke-width="1.2"/>`).join('')
  return `<rect x="12.3" y="18" width="2.4" height="4.2" fill="${INK}"/><rect x="19.3" y="18" width="2.4" height="4.2" fill="${INK}"/>`
}
const ZZ = `<g class="zz"><text x="30" y="2" font-size="6" font-weight="700" fill="#9a9a96">z</text><text x="35" y="-3" font-size="4.5" font-weight="700" fill="#9a9a96">z</text></g>`

// Each role: its outfit and props, and what it shows only while it runs.
const ROLES: Record<string, { gear: string; live?: string }> = {
  // Ranger: a green hood and a bow that sways.
  ranger: {
    gear: `<polygon points="7,10 29,10 35,5 13,5 13,2 30,2 35,5" fill="#5E9E45"/><polygon points="9,10 27,10 31,6.5 13,6.5" fill="#4A7F37"/>
<g class="sway"><path d="M3 9 q-4 6 0 12" stroke="#A8743F" stroke-width="1.2" fill="none"/><path d="M3 9v12" stroke="#E9EEF4" stroke-width=".4"/></g>`,
  },
  // Wizard: a pointed hat and a staff whose orb glows.
  wizard: {
    gear: `<polygon points="11,7.5 30,7.5 22,-8" fill="#8A6FE0"/><rect x="10" y="6.5" width="21" height="2" fill="#6A51C0"/><circle cx="21" cy="1" r=".9" fill="#F2C14E"/>
<path d="M38 21V6" stroke="${WOOD}" stroke-width="1.2"/><circle class="blink" cx="38" cy="5" r="2" fill="#B8A6FF"/>`,
  },
  // Knight: a helmet with a plume and a sword that swings.
  knight: {
    gear: `<rect x="13" y="0" width="14" height="7.5" rx="2" fill="#B8BFC9"/><rect x="11" y="6.5" width="18" height="2" fill="#9AA3B2"/><path d="M20 0 q2-4 6-4" stroke="#D0453F" stroke-width="2" fill="none"/>
<g class="turn"><path d="M37.5 14V3" stroke="#D8DDE4" stroke-width="1.6"/><path d="M35.5 13h4" stroke="${WOOD}" stroke-width="1.2"/></g>`,
  },
  // Bard: a feathered cap and a lute it strums, with notes while it plays.
  bard: {
    gear: `<polygon points="11,7.5 29,7.5 31,4 26,1.5 15,2" fill="#5FBF8F"/><rect x="11" y="6.5" width="18" height="1.6" fill="#3F9A6E"/><path d="M26 3 q5 -7 11 -6 q-5 2 -9 6" fill="#F2C14E"/>
<g class="strum"><path d="M8 25.5 L25 23.2" stroke="${WOOD}" stroke-width="1.6"/><rect x="24" y="22" width="3.2" height="2.2" fill="#5A3A1A"/>
<ellipse cx="6" cy="26" rx="5.5" ry="4.2" fill="#C08A4A"/><circle cx="6.5" cy="25.6" r="1.3" fill="#3A2A1A"/><path d="M3 25.6 L25 22.7M3 26.6 L25 23.7" stroke="#F1EEE6" stroke-width=".3"/></g>`,
    live: `<g class="note"><path d="M40 6v-5l3 -1v4" stroke="#5FBF8F" stroke-width=".8" fill="none"/><circle cx="39.3" cy="6" r="1.1" fill="#5FBF8F"/><circle cx="42.3" cy="4" r="1.1" fill="#5FBF8F"/></g>`,
  },
  // Alchemist: goggles on the brow and a potion whose bubble blinks.
  alchemist: {
    gear: `<rect x="13" y="6" width="14" height="2.4" fill="#3A3A40"/><circle cx="16.5" cy="7.2" r="1.6" fill="#7FC3E6"/><circle cx="23.5" cy="7.2" r="1.6" fill="#7FC3E6"/>
<path d="M37 8h3v3l2 5h-7l2-5z" fill="#E0609E" fill-opacity=".8" stroke="#E9EEF4" stroke-width=".5"/><circle class="blink" cx="38.5" cy="5" r=".9" fill="#E0609E"/>`,
  },
  // Squire: a leather cap and a wooden shield.
  squire: {
    gear: `<rect x="13" y="3.5" width="14" height="4" rx="2" fill="#A8743F"/><path d="M-1 12h7v5q0 4-3.5 5q-3.5-1-3.5-5z" fill="#E39B2D" stroke="${WOOD}" stroke-width=".6"/><path d="M2.5 13v8" stroke="${WOOD}" stroke-width=".6"/>`,
  },
}

/** One Clawd at (x, y), 40×34 units at `scale`. */
export const avatar = (x: number, y: number, costume: string, mood: Mood, isRunning: boolean, isWarning: boolean, scale = 0.75): string => {
  const role = ROLES[costume] ?? ROLES.squire
  const warning = isWarning
    ? `<g class="warn"><circle cx="5" cy="3" r="3.6" fill="${WARN}"/><rect x="4.4" y=".8" width="1.2" height="2.9" fill="${INK}"/><rect x="4.4" y="4.4" width="1.2" height="1.2" fill="${INK}"/></g>`
    : ''
  return `<g transform="translate(${x},${y}) scale(${scale})"><g class="vx${isRunning ? ' run' : ''}">
<g class="bd">${BLOCK}${face(mood)}${role?.gear ?? ''}${isRunning ? (role?.live ?? '') : ''}</g><g class="la">${leg(9)}${leg(20)}</g><g class="lb">${leg(14)}${leg(25)}</g>${mood === 'sleep' ? ZZ : ''}${warning}</g></g>`
}
