// Small progressive enhancements. Every page works without this file.

// Confirm destructive actions: <form data-confirm> or <button data-confirm>.
document.addEventListener('submit', (e) => {
	const form = e.target;
	const msg = e.submitter?.dataset.confirm || form.dataset.confirm;
	if (msg && !confirm(msg)) e.preventDefault();
});

// Filter bars and "Add someone…" pickers submit as soon as a dropdown changes.
for (const form of document.querySelectorAll('form[data-autosubmit]')) {
	form.addEventListener('change', (e) => {
		if (e.target.tagName === 'SELECT') form.requestSubmit();
	});
}

// Meeting action items: "+ Another" clones a blank row.
for (const btn of document.querySelectorAll('[data-add-row]')) {
	btn.addEventListener('click', () => {
		const rows = btn.closest('form').querySelector('[data-rows]');
		const last = rows.querySelector('[data-row]:last-child');
		const row = last.cloneNode(true);
		for (const input of row.querySelectorAll('input:not([type=date]), select')) input.value = '';
		rows.append(row);
		row.querySelector('input:not([type=hidden])').focus();
	});
}

// Attendance: mark everyone present in one click (still needs Save).
for (const btn of document.querySelectorAll('[data-all-present]')) {
	btn.addEventListener('click', () => {
		for (const radio of btn.closest('form').querySelectorAll('input[type=radio][value=present]')) radio.checked = true;
	});
}

// Menus (<details class="menu">): one open at a time; a click elsewhere or Escape closes them.
const openMenus = () => document.querySelectorAll('details.menu[open]');
document.addEventListener('click', (e) => {
	for (const menu of openMenus()) if (!menu.contains(e.target)) menu.open = false;
});
document.addEventListener('keydown', (e) => {
	if (e.key !== 'Escape') return;
	for (const menu of openMenus()) {
		menu.open = false;
		menu.querySelector('summary').focus();
	}
});

// People picker: the search box filters the checklist below it.
for (const input of document.querySelectorAll('[data-picker-filter]')) {
	const items = input.closest('.picker').querySelectorAll('label');
	input.addEventListener('input', () => {
		const q = input.value.trim().toLowerCase();
		for (const item of items) item.hidden = !!q && !item.textContent.toLowerCase().includes(q);
	});
	// Enter in the filter shouldn't submit the whole task form.
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') e.preventDefault();
	});
}

// People pickers (assign a task, who a meeting is for): ticking a team ticks everyone on it, and
// unticking it unticks them unless another ticked team still has them. Unticking the last person
// on a team unticks the team. Whole club ticks everyone and locks the list, since a club event is
// open to all.
for (const picker of document.querySelectorAll('.picker')) {
	const boxes = [...picker.querySelectorAll('.picker-list input[type=checkbox]')];
	const teams = [...picker.querySelectorAll('.picker-teams input[type=checkbox]')];
	const club = teams.find((t) => t.value === 'club');
	const count = picker.querySelector('[data-picker-count]');
	const on = (box, team) => team === club || !!box.closest('label').dataset.teams?.split(' ').includes(team.value);
	const members = (team) => boxes.filter((b) => on(b, team));
	const sync = () => {
		for (const b of boxes) b.disabled = !!club?.checked;
		if (count) {
			const n = boxes.filter((b) => b.checked).length;
			count.textContent = n === 1 ? '1 person' : `${n} people`;
		}
	};
	if (teams.length) {
		// Tells the server the people list matches the teams, so anyone unticked was left out on purpose.
		const synced = Object.assign(document.createElement('input'), { type: 'hidden', name: 'people_synced', value: '1' });
		picker.append(synced);
	}
	for (const team of teams) {
		team.addEventListener('change', () => {
			if (team === club) {
				for (const t of teams) if (t !== club) t.checked = false;
			} else if (club?.checked) {
				// Switching from the whole club to a team: start from just that team.
				club.checked = false;
				for (const b of boxes) b.checked = false;
			}
			if (team.checked) for (const b of members(team)) b.checked = true;
			else for (const b of members(team)) b.checked = teams.some((t) => t.checked && on(b, t));
			sync();
		});
	}
	for (const b of boxes) {
		b.addEventListener('change', () => {
			if (!b.checked) for (const t of teams) if (t.checked && on(b, t) && !members(t).some((x) => x.checked)) t.checked = false;
			sync();
		});
	}
	picker.querySelector('[data-picker-clear]')?.addEventListener('click', () => {
		for (const x of [...boxes, ...teams]) x.checked = false;
		sync();
	});
	sync();
}

// Meeting form: picking a start time sets the end an hour later, until someone picks the end themselves.
for (const start of document.querySelectorAll('select[name=time]')) {
	const end = start.form?.querySelector('select[name=end_time]');
	if (!end) continue;
	let auto = !end.value;
	end.addEventListener('change', () => (auto = false));
	start.addEventListener('change', () => {
		if (!auto) return;
		const [h, m] = start.value.split(':').map(Number);
		const later = start.value && `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		end.value = [...end.options].some((o) => o.value === later) ? later : '';
	});
}

// Form screen: the response count refreshes every few seconds. "People here" makes it "12 of 40".
for (const count of document.querySelectorAll('[data-live-count]')) {
	const total = document.querySelector('[data-live-total]');
	const of = document.querySelector('[data-live-of]');
	const key = total && `form-total-${total.dataset.liveTotal}`;
	try {
		if (total) total.value = localStorage.getItem(key) ?? '';
	} catch {}
	const show = () => {
		const n = Number(total?.value) || 0;
		if (of) of.textContent = n > 0 ? ` of ${n}` : '';
		count.parentElement.classList.toggle('all-in', n > 0 && Number(count.textContent) >= n);
	};
	total?.addEventListener('input', () => {
		try {
			localStorage.setItem(key, total.value);
		} catch {}
		show();
	});
	show();
	setInterval(async () => {
		try {
			const res = await fetch(count.dataset.liveCount, { headers: { Accept: 'application/json' } });
			if (res.ok) count.textContent = (await res.json()).count;
			show();
		} catch {}
	}, 3000);
}
