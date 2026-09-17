# React Bits adapters

Selected for VC Node from the shared React web component catalog. No dependency
was added. React Native libraries in that catalog target other platforms.

Source: https://github.com/DavidHDev/react-bits

Local upstream revision: `0e69e737242df1d257b4e5e399b01ae1d7901375`.

Original TypeScript + CSS files:

- `src/ts-default/Components/SpotlightCard/SpotlightCard.tsx`
- `src/ts-default/Components/SpotlightCard/SpotlightCard.css`
- `src/ts-default/TextAnimations/BlurText/BlurText.tsx`

Full upstream copyright and MIT + Commons Clause notice is preserved in
[`licenses/react-bits.txt`](../../../licenses/react-bits.txt). This permits
use within this application; it restricts resale or redistribution of the
components themselves.

`SpotlightCard` retains the pointer-position gradient and CSS-variable updates.
Its selectors are scoped to `rb-spotlight-card`; backgrounds, borders, padding,
and clipping remain the application's choice. It does not intercept controls or
rerender during pointer movement. Touch/coarse pointers and reduced-motion
preferences disable the effect.

`BlurText` uses VC Node's existing `framer-motion` dependency in place of
`motion/react`. It renders valid spans inside a heading, exposes the complete
text once to screen readers, and hides animated fragments from accessibility
APIs. The entrance runs once with a short stagger; reduced motion, a missing
observer, or observer initialization failure shows static text immediately.
