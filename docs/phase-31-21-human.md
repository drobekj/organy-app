# Phase 31.21 HUMAN checkpoint

Only the minimal Service Context presentation is new.

Verify:

1. The first row is Date | Time | Language, three equal-width controls across the complete Service Context width.
2. The second row is Priest | Organist, 50:50 across the complete width.
3. The third row is Antiphon | Topic, 50:50 across the complete width.
4. Service note remains full width below Antiphon/Topic, but has no visible `Service note` label and is only one normal input-control line high; its existing placeholder remains visible when empty.
5. Visible labels are compact (`Date`, `Time`, `Language`) and the former persistent helper/status lines below Time/Priest/Organist are absent.
6. Antiphon/Topic retain their accepted placeholders and lookup behavior; no legacy candidate technical fields are visible.

No previously accepted Antiphon/Topic behavior needs to be retested beyond obvious visual regression.
