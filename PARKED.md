# Classic app: parked fixes

The classic app (the root of this site) is parked while the 3D first-class cabin (`/cabin/`) is being built.
These are the changes still to make to it:

1. **Passport:** remove the "2/6" page counter and the arrows under the passport. Swiping between pages is enough.
2. **Stamps are blurry:** the `#inkGrain` SVG filter on stamps softens them. Drop the filter (the cabin draws stamps crisp, so reuse that approach).
3. **Black cut-off thing at the top:** most likely the toast sitting at `translate(-50%, -140%)` and peeking under the header. Move it fully off-screen and hide it (`visibility: hidden`) when it isn't showing.
4. **Header looks rough:** tidy the top bar. The time display itself is fine.
5. **Flight tab:** the cards at the bottom overlap slightly. Fix the spacing.
6. **Checklist redesign** (the cabin's bag already works this way):
   - no separate edit mode
   - type to add; Enter makes a new item
   - tap the circle to tick
   - swipe left to delete
   - no categories, just dividers you can name
