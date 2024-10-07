---
title: Home 🌍
---
## Entry Point
Entry point into my knowledge:
- Life OS
	- [[Life Right Now]]
	- [[The Plan]]
	- [[My Main Skills]]
	- [[Other Skills]]
	- [[Identified Weaknesses]]
	- [[Motivation Doc]]
	- [[Promises]]
	- [[Full Rules]]
	- [[House Organization -- to update]]
	- [[To Buy in Life]]
	- [[Maulwified Possessions]]
	- [[Productivity Tactics]]
	- [[Health MOC]] 
	- [[Finances]]
	- [[Life Map 🗺]] 
	- [[Meta PKM -- Best Practices for PKM]] 
	- [[PKM Guide]]
	- [[Visualization List]]
	- [[Tasks]]
- Dashboards
	- [[Goals -- to update]]
	- [[Life Areas]]
	- [[Plan]]
	- [[Projects]]

![[pale-blue-dot-banner.jpg]]
## Inbox
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

## Snoozed Notes
``` dataview
TABLE WITHOUT ID
 file.link as "Name",
 (date(today) - file.cday).day as "Days alive",
 file.folder as "Sub-folder"
FROM "+ Inbox/Snoozed"
SORT file.folder asc, "Days alive" asc
LIMIT 20
```


## Review Notes
```dataview
TABLE WITHOUT ID 
file.link AS "Review Notes", 
Created as "Created"
FROM "Resources/DONT MOVE NEW NOTES HERE"
LIMIT 5
```
## Life Right Now
![[Life Right Now#^f98883]]
## The Why
The teens of the world counting on you, and you are indebted to save them as a khadim firefighter
## Time is fleeting...
These moments are our capital because these could be our last days
Live like an Airman
## Things to Remember
- Family Dawah Currently Consists of Silence and Letting Go
- Live like an Airman
