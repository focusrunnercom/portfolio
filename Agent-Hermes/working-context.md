# Working Context — Sunday 24 May 2026 05:00 UTC

## State
- **Today**: Sunday — rest day (6-day week, no Sunday content)
- **Next production**: Monday 25 May — Week 20 Day 2
- **LinkedIn API**: Fixed! Use `LinkedIn-Version: 202506` header + `lifecycleState: PUBLISHED` field
- **Instagram images**: Available at focusrunner.io/public/ig/ig-1.jpg through ig-5.jpg
- **X/FB/IG**: All tokens valid. CMO agent ran on Saturday and posted 15/20 (LinkedIn was broken)
- **Paperclip active**: FOC-861 (CMO Daily Growth Check, in_progress, created 09:00 UTC today)

## LinkedIn Fix
Old command missing LinkedIn-Version header and lifecycleState. Fix:
- Add `-H "LinkedIn-Version: 202506"`
- Add `"lifecycleState": "PUBLISHED"` to the JSON body

## Channels Working
- X/Twitter: ✅ xurl works, 5 posts verified May 23
- LinkedIn: ✅ Fixed (token valid, version updated)
- Facebook: ✅ Page token works, 5 posts verified May 23
- Instagram: ✅ Two-step API works, 5 image posts verified May 23
