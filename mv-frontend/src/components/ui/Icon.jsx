/**
 * Line icons drawn instead of pasted.
 *
 * Emoji bring their own palette and their own vertical metrics, so 🎬 next to a
 * ★ renders purple and sits off the baseline no matter what the CSS says.
 * These stroke in `currentColor` at whatever `size` the caller asks for, so
 * they inherit colour from the text around them and follow a theme switch.
 *
 * Two icons, no registry and no sprite sheet — add a third here when a third
 * is actually needed.
 */

const base = (size) => ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    stroke: 'none',
    'aria-hidden': true,
    focusable: false,
});

/**
 * Clapperboard, stick hinged at the left and lifted open on the right.
 *
 * Solid fill. The three slashes are knocked OUT of the stick with evenodd
 * rather than painted over it, so they show the page through instead of a
 * hardcoded background colour — which would go wrong the moment the icon sits
 * on a card, a poster fallback, or a dark theme.
 */
export const ClapperIcon = ({ size = 24, ...rest }) => (
    <svg {...base(size)} {...rest}>
        <path d="M3 11h18v10H3Z" />
        <path
            fillRule="evenodd"
            d="M3.2 10.6 20.8 5.1 19.9 2.1 2.3 7.6Z
               M7.07 9.39 8.12 9.06 7.22 6.06 6.17 6.39Z
               M11.12 8.13 12.17 7.80 11.27 4.80 10.22 5.13Z
               M15.17 6.86 16.22 6.53 15.32 3.53 14.27 3.86Z"
        />
    </svg>
);

/** Lens knocked out of a solid disc, so the ring reads at small sizes. */
export const SearchIcon = ({ size = 24, ...rest }) => (
    <svg {...base(size)} {...rest}>
        <path
            fillRule="evenodd"
            d="M10.8 3a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6Zm0 2.2a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2Z"
        />
        <path d="m16.15 14.6 4.85 4.85-1.55 1.55-4.85-4.85Z" />
    </svg>
);
