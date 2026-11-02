# Demo site

`demo-dance-studio.json` is a CMS export (the format of admin → **Backup** →
Export) of a **fictional** dance studio, for trying the CMS. Quickstep Dance
Studio, its teacher Luna Quickstep and everyone quoted on it are made up. The
contact details use reserved example values, and the pictures are stick figures.

Import it in admin → Backup → Import. Import **upserts by slug/key**: pages and
site design (header, footer, colours) with the same slug are overwritten, other
pages are left alone, and every image is uploaded again as a new media record.

Pages: `home`, `about`, `classes` and `book`, plus two sample events.

The export format holds pages, site design and events, not services or slots.
So `book` says nothing is available until you add a service under
**Services & products** and time windows under **Slots**.

The calendar shows the current and next month only, so the sample events
(November and December 2026) stop appearing after that. Give them new dates
under **Events**.
