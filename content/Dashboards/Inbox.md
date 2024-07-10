---
Created: 2024-06-03 19:56
---
> [!HINT]+ This isn't a normal inbox. It's a cooling pad 🧊.
> Thoughts come in hot 🌶. But after a few days, they cool down ❄️.
> When cooler thoughts prevail, you can better prioritize. Cool, right?
> This view looks at the 20 newest notes in your **+ Inbox** folder. As you process each note, make connections, add details, move them to the best folder,  and delete everything that no longer sparks joy ✨. 

``` dataview
TABLE WITHOUT ID
 file.link as "Name",
 (date(today) - file.cday).day as "Days alive",
 file.folder as "Sub-folder"
FROM "+ Inbox"
WHERE file.name != "+ Focus Page 🎯" AND !contains(file.folder, "Snoozed")
SORT file.folder asc, "Days alive" asc
LIMIT 20
```

























