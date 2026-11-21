// Small browser interactions for the server-rendered pages.

for (const filters of document.querySelectorAll('[data-library-filters]')) {
	const section = filters.closest('.meeting-library');
	const author = filters.querySelector('[data-library-author-filter]');
	const type = filters.querySelector('[data-library-type-filter]');
	const apply = () => {
		let visible = 0;
		for (const item of section.querySelectorAll('[data-library-item]')) {
			item.hidden = !!((author.value && item.dataset.libraryAuthor !== author.value) || (type.value && item.dataset.libraryType !== type.value));
			if (!item.hidden) visible++;
		}
		section.querySelector('[data-library-no-results]').hidden = visible > 0;
	};
	filters.addEventListener('change', apply);
}

for (const notice of document.querySelectorAll('[data-system-notice]')) {
	const dismiss = () => { notice.hidden = true; };
	notice.querySelector('[data-dismiss-notice]')?.addEventListener('click', dismiss);
	setTimeout(dismiss, 5000);
}
if (document.querySelector('[data-system-notice]')) {
	const url = new URL(location.href);
	url.searchParams.delete('ok');
	url.searchParams.delete('error');
	history.replaceState(history.state, '', url);
}

for (const input of document.querySelectorAll('input[type="file"][name="file"]')) {
	input.addEventListener('change', () => {
		input.setCustomValidity([...input.files].reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024 ? 'Choose files totaling no more than 8 MiB.' : '');
		if (input.validationMessage) input.reportValidity();
	});
}

for (const form of document.querySelectorAll('[data-board-move]')) {
	form.querySelector('select')?.addEventListener('change', () => form.requestSubmit());
}

for (const board of document.querySelectorAll('.kanban')) {
	let dragged = null;
	board.addEventListener('dragstart', (event) => {
		const card = event.target.closest('[data-board-draggable]');
		if (!card || !board.contains(card)) return;
		dragged = card;
		card.classList.add('is-dragging');
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', 'task');
	});
	board.addEventListener('dragover', (event) => {
		const column = event.target.closest('[data-board-stage]');
		if (!dragged || !column || !board.contains(column)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		for (const item of board.querySelectorAll('.is-drop-target')) item.classList.remove('is-drop-target');
		column.classList.add('is-drop-target');
	});
	board.addEventListener('drop', (event) => {
		const column = event.target.closest('[data-board-stage]');
		if (!dragged || !column || !board.contains(column)) return;
		event.preventDefault();
		const form = dragged.querySelector('[data-board-move]');
		const select = form?.querySelector('select[name="status"]');
		if (select && select.value !== column.dataset.boardStage) {
			select.value = column.dataset.boardStage;
			form.requestSubmit();
		}
	});
	board.addEventListener('dragend', () => {
		dragged?.classList.remove('is-dragging');
		dragged = null;
		for (const item of board.querySelectorAll('.is-drop-target')) item.classList.remove('is-drop-target');
	});
}

for (const form of document.querySelectorAll('[data-meeting-filters]')) {
	let pending;
	form.addEventListener('change', async () => {
		const count = form.querySelectorAll('input[name="team"]:checked').length;
		form.querySelector('[data-team-filter-label]').textContent = count ? `Teams (${count}) ▾` : 'All teams ▾';
		const params = new URLSearchParams(new FormData(form));
		if (!params.get('kind')) params.delete('kind');
		if (!params.get('date')) { params.delete('date'); params.delete('date_mode'); }
		const url = `${form.action}${params.size ? `?${params}` : ''}`;
		pending?.abort();
		pending = new AbortController();
		try {
			const response = await fetch(url, { signal: pending.signal });
			if (!response.ok) throw new Error('Could not load meetings');
			const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
			const results = doc.getElementById('meeting-filter-results');
			if (!results) throw new Error('Missing meeting results');
			document.getElementById('meeting-filter-results').replaceWith(results);
			history.replaceState(null, '', url);
		} catch (error) {
			if (error.name !== 'AbortError') location.assign(url);
		}
	});
}

for (const group of document.querySelectorAll('[data-meeting-tabs]')) {
	const tabs = [...group.querySelectorAll(':scope > [role="tablist"] > [role="tab"]')];
	const select = (tab, updateUrl = false) => {
		for (const option of tabs) {
			const selected = option === tab;
			option.setAttribute('aria-selected', String(selected));
			option.tabIndex = selected ? 0 : -1;
			document.getElementById(option.getAttribute('aria-controls')).hidden = !selected;
		}
		if (updateUrl) history.replaceState(null, '', tab.href);
	};
	for (const [index, tab] of tabs.entries()) {
		tab.addEventListener('click', (event) => {
			if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			select(tab, true);
		});
		tab.addEventListener('keydown', (event) => {
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
				: event.key === 'ArrowRight' ? (index + 1) % tabs.length
				: event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
			if (next === null) return;
			event.preventDefault();
			select(tabs[next], true);
			tabs[next].focus();
		});
	}
	const revealAnchor = () => {
		const target = document.getElementById(location.hash.slice(1));
		const panel = target?.closest('[role="tabpanel"]');
		if (!panel || !group.contains(panel)) return;
		select(tabs.find((tab) => tab.getAttribute('aria-controls') === panel.id));
		target.scrollIntoView({ block: 'start' });
	};
	revealAnchor();
	window.addEventListener('hashchange', revealAnchor);
}

for (const group of document.querySelectorAll('[data-library-tabs]')) {
	const tabs = [...group.querySelectorAll('[role="tab"]')];
	const select = (tab) => {
		for (const option of tabs) {
			const selected = option === tab;
			option.setAttribute('aria-selected', String(selected));
			option.tabIndex = selected ? 0 : -1;
			document.getElementById(option.getAttribute('aria-controls')).hidden = !selected;
		}
	};
	for (const [index, tab] of tabs.entries()) {
		tab.addEventListener('click', () => select(tab));
		tab.addEventListener('keydown', (event) => {
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
			if (next === null) return;
			event.preventDefault();
			select(tabs[next]);
			tabs[next].focus();
		});
	}
}

for (const button of document.querySelectorAll('[data-members-dialog]')) {
	const dialog = document.getElementById(button.dataset.membersDialog);
	if (!(dialog instanceof HTMLDialogElement)) continue;
	button.addEventListener('click', () => dialog.showModal());
	dialog.addEventListener('close', () => button.focus());
	dialog.addEventListener('click', (e) => {
		if (e.target === dialog) dialog.close();
	});
}

const newTeamTaskDialog = document.getElementById('new-team-task');
if (newTeamTaskDialog instanceof HTMLDialogElement) {
	const status = newTeamTaskDialog.querySelector('input[name="status"]');
	document.querySelector('[data-members-dialog="new-team-task"]')?.addEventListener('click', () => { if (status) status.value = 'open'; });
	for (const button of document.querySelectorAll('[data-board-add]')) {
		button.addEventListener('click', () => {
			if (status) status.value = button.dataset.boardAdd;
			newTeamTaskDialog.showModal();
			newTeamTaskDialog.addEventListener('close', () => button.focus(), { once: true });
		});
	}
}

for (const form of document.querySelectorAll('form[data-board-assignment]')) {
	const error = form.querySelector('[data-assignment-error]');
	form.addEventListener('change', () => { if (error) error.hidden = true; });
	form.addEventListener('submit', (event) => {
		if (form.querySelector('input[name="person"]:checked, input[name="subteam"]:checked')) return;
		event.preventDefault();
		if (error) error.hidden = false;
		const first = form.querySelector('input[name="person"], input[name="subteam"]');
		// People are picked by typing now, so focus that box rather than the hidden checkbox.
		(first?.closest('[data-pick-people]')?.previousElementSibling?.querySelector('.combo-input') ?? first)?.focus();
	});
}

// A meeting's reason box stays hidden until it's needed: on Cancel, or when the date or time changes.
const reasonBox = document.querySelector('[data-reason]');
const showReason = (why) => {
	reasonBox.querySelector('.label').textContent = why;
	reasonBox.hidden = false;
};
if (reasonBox) {
	const form = reasonBox.closest('form');
	const input = reasonBox.querySelector('input');
	const timing = ['date', 'time', 'end_time'].map((n) => form.elements[n]).filter(Boolean);
	const was = timing.map((el) => el.value);
	form.addEventListener('change', (e) => {
		if (!timing.includes(e.target)) return;
		input.required = timing.some((el, i) => el.value !== was[i]);
		if (input.required) showReason('Reason for the new date or time');
		else if (!input.value.trim()) reasonBox.hidden = true;
	});
}

// Buttons that need a field filled in first: <button data-needs="reason"> (canceling a meeting).
document.addEventListener('submit', (e) => {
	const needs = e.submitter?.dataset.needs;
	const field = needs && e.target.querySelector(`[name=${needs}]`);
	if (!field || field.value.trim()) return;
	e.preventDefault();
	e.stopImmediatePropagation();
	if (reasonBox?.contains(field)) showReason('Reason for canceling');
	field.required = true;
	field.reportValidity();
	field.focus();
});

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
		for (const combo of row.querySelectorAll('.combo')) combo.remove();
		for (const input of row.querySelectorAll('input:not([type=date]), select')) {
			input.value = '';
			input.required = false; // Extra lines are optional; blank ones are skipped.
		}
		rows.append(row);
		for (const select of row.querySelectorAll('select[data-person]')) personSelect(select);
		row.querySelector('input:not([type=hidden])').focus();
	});
}

// Save only changed attendance entries, in order, so unrelated check-ins stay intact.
for (const form of document.querySelectorAll('form[data-attendance-autosave]')) {
	let pending = Promise.resolve();
	const status = form.querySelector('[data-attendance-status]');
	const save = (entries) => {
		if (!status) { form.requestSubmit(); return; }
		status.textContent = 'Saving…';
		pending = pending.then(async () => {
			const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(entries) });
			if (!response.ok || !response.url.includes('ok=attendance')) throw new Error('Save failed');
		}).then(() => { status.textContent = 'Saved'; }).catch(() => { status.textContent = 'Could not save attendance. Please try again.'; });
	};
	form.addEventListener('change', (event) => {
		const input = event.target;
		if (input.matches('input[type="radio"]:checked')) save([[input.name, input.value]]);
	});
	form.addEventListener('attendance-mark-all', () => save([...form.querySelectorAll('input[type="radio"][value="present"]:checked')].map((input) => [input.name, input.value])));
}

// Attendance: mark everyone present in one click.
for (const btn of document.querySelectorAll('[data-all-present]')) {
	btn.addEventListener('click', () => {
		for (const radio of btn.form.querySelectorAll('input[type=radio][value=present]')) radio.checked = true;
		btn.form.dispatchEvent(new Event('attendance-mark-all'));
	});
}

// Keep the selected meeting's column in view when the history first opens.
for (const history of document.querySelectorAll('.attendance-history')) {
	history.addEventListener('toggle', () => {
		if (history.open) {
			const table = history.querySelector('.table-scroll');
			if (table) table.scrollLeft = table.scrollWidth;
		}
	}, { once: true });
}

// Dropdown menus close on outside clicks or Escape; inline disclosures stay open.
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
		picker.dispatchEvent(new Event('people-sync', { bubbles: true }));
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

// Picking people: type part of a name and choose from the dropdown, instead of scrolling a long
// list. <select data-person> picks one person; [data-pick-people] (a list of ticked boxes) picks several,
// shown as chips. The select or boxes stay in the form, hidden, so what gets posted is unchanged.
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
let comboSeq = 0;

function combo({ input, wrap, options, pick }) {
	const list = document.createElement('ul');
	const listId = `combo-${++comboSeq}`;
	Object.assign(list, { id: listId, className: 'combo-list', hidden: true });
	list.setAttribute('role', 'listbox');
	input.setAttribute('role', 'combobox');
	input.setAttribute('aria-autocomplete', 'list');
	input.setAttribute('aria-expanded', 'false');
	input.setAttribute('aria-controls', listId);
	Object.assign(input, { autocomplete: 'off', spellcheck: false });
	wrap.append(list);
	let shown = [];
	let active = -1;
	let typed = false;
	const highlight = () => {
		[...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
		const li = list.children[active];
		if (li) {
			input.setAttribute('aria-activedescendant', li.id);
			li.scrollIntoView({ block: 'nearest' });
		} else input.removeAttribute('aria-activedescendant');
	};
	const close = () => {
		list.hidden = true;
		input.setAttribute('aria-expanded', 'false');
		input.removeAttribute('aria-activedescendant');
	};
	const render = () => {
		const q = typed ? fold(input.value) : '';
		// Every word typed has to appear in the name ("ev li" finds Evan Liu); names where one starts
		// a word come first.
		const words = q.split(' ').filter(Boolean);
		const starts = (name) => words.every((w) => name.startsWith(w) || name.includes(' ' + w));
		shown = options()
			.map((o) => ({ o, name: fold(o.text) }))
			.filter(({ name }) => words.every((w) => name.includes(w)))
			.sort((a, b) => Number(starts(b.name)) - Number(starts(a.name)))
			.map(({ o }) => o);
		list.replaceChildren(
			...shown.map((o, i) => {
				const li = document.createElement('li');
				li.id = `${listId}-${i}`;
				li.setAttribute('role', 'option');
				li.textContent = o.text;
				if (o.blank) li.classList.add('combo-blank');
				li.addEventListener('mousedown', (e) => e.preventDefault());
				li.addEventListener('click', () => choose(i));
				return li;
			})
		);
		if (!shown.length) {
			const li = Object.assign(document.createElement('li'), { className: 'combo-none', textContent: q ? 'No one matches' : 'No one left to add' });
			list.append(li);
		}
		active = shown.length ? 0 : -1;
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
		highlight();
	};
	const choose = (i) => {
		const o = shown[i];
		if (!o) return;
		typed = false;
		pick(o);
	};
	input.addEventListener('focus', () => {
		typed = false;
		input.select();
		render();
	});
	input.addEventListener('click', () => list.hidden && render());
	input.addEventListener('input', () => {
		typed = true;
		render();
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (list.hidden) return render();
			if (!shown.length) return;
			active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
			highlight();
		} else if (e.key === 'Enter') {
			if (list.hidden) return;
			e.preventDefault(); // Picking someone shouldn't submit the form.
			choose(active);
		} else if (e.key === 'Escape') {
			if (list.hidden) return;
			e.preventDefault();
			e.stopPropagation(); // Close the list, not the dialog around it.
			close();
			input.dispatchEvent(new Event('combo-cancel'));
		}
	});
	input.addEventListener('blur', () => {
		close();
		input.dispatchEvent(new Event('combo-cancel'));
	});
	return { render, close };
}

function personSelect(select) {
	if (select.dataset.enhanced) select.nextElementSibling?.classList.contains('combo') && select.nextElementSibling.remove();
	select.dataset.enhanced = '1';
	select.classList.add('combo-native');
	select.tabIndex = -1;
	select.setAttribute('aria-hidden', 'true');
	const wrap = Object.assign(document.createElement('div'), { className: 'combo' });
	const input = document.createElement('input');
	input.type = 'text';
	input.className = 'combo-input';
	const blank = [...select.options].find((o) => o.value === '');
	input.placeholder = blank?.text || 'Type a name';
	input.setAttribute('aria-label', select.getAttribute('aria-label') || select.closest('label, .field')?.querySelector('.label')?.textContent || 'Person');
	if (select.id) {
		// A <label for> pointing at the select now focuses the box you type in.
		for (const label of document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`)) label.addEventListener('click', (e) => { e.preventDefault(); input.focus(); });
	}
	const showSelected = () => {
		const o = select.selectedOptions[0];
		input.value = o && o.value !== '' ? o.text.trim() : '';
	};
	wrap.append(input);
	select.after(wrap);
	// A label wrapping the select would hand its clicks to the hidden select; send them to the box.
	select.closest('label')?.addEventListener('click', (e) => {
		if (e.target === input || wrap.contains(e.target)) return;
		e.preventDefault();
		input.focus();
	});
	combo({
		input,
		wrap,
		options: () =>
			[...select.options]
				.filter((o) => !o.disabled && (o.value !== '' || !select.required))
				.map((o) => ({ text: o.text.trim(), value: o.value, blank: o.value === '' })),
		pick: (o) => {
			const changed = select.value !== o.value;
			select.value = o.value;
			showSelected();
			wrap.classList.remove('invalid');
			input.blur();
			if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
		}
	});
	input.addEventListener('combo-cancel', showSelected);
	input.disabled = select.disabled;
	select.addEventListener('invalid', (e) => {
		e.preventDefault();
		wrap.classList.add('invalid');
		input.focus();
	});
	select.form?.addEventListener('reset', () => setTimeout(showSelected));
	showSelected();
}

function peopleList(box) {
	box.classList.add('combo-hidden');
	const field = Object.assign(document.createElement('div'), { className: 'people-field combo' });
	const chips = Object.assign(document.createElement('div'), { className: 'people-chips' });
	const input = Object.assign(document.createElement('input'), { type: 'text', className: 'combo-input', placeholder: 'Type a name to add' });
	const legend = box.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
	input.setAttribute('aria-label', legend ? `${legend}: type a name to add` : 'Type a name to add');
	field.append(chips, input);
	box.before(field);
	const boxes = () => [...box.querySelectorAll('input[type=checkbox]')];
	const nameOf = (b) => b.closest('label').textContent.replace(/\s+/g, ' ').trim();
	const set = (b, on) => {
		b.checked = on;
		b.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const draw = () => {
		const all = boxes();
		const locked = all.length > 0 && all.every((b) => b.disabled);
		field.hidden = locked; // Whole club: everyone's in, nothing to pick.
		const picked = all.filter((b) => b.checked);
		chips.replaceChildren(
			...picked.map((b) => {
				const chip = Object.assign(document.createElement('span'), { className: 'person-chip' });
				const name = nameOf(b);
				const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'person-chip-x', textContent: '×' });
				remove.setAttribute('aria-label', `Remove ${name}`);
				remove.addEventListener('click', () => {
					set(b, false);
					draw();
					input.focus();
				});
				chip.append(name, remove);
				return chip;
			})
		);
	};
	const { render } = combo({
		input,
		wrap: field,
		options: () => boxes().filter((b) => !b.checked && !b.disabled).map((b) => ({ text: nameOf(b), box: b })),
		pick: (o) => {
			set(o.box, true);
			input.value = '';
			draw();
			render(); // Stay open to add the next person.
		}
	});
	input.addEventListener('combo-cancel', () => (input.value = ''));
	input.addEventListener('keydown', (e) => {
		// Backspace in an empty box takes off the last person.
		if (e.key !== 'Backspace' || input.value) return;
		const last = boxes().filter((b) => b.checked && !b.disabled).pop();
		if (!last) return;
		set(last, false);
		draw();
		if (document.activeElement === input) render();
	});
	field.addEventListener('click', (e) => {
		if (e.target === field || e.target === chips) input.focus();
	});
	// Teams ticked or cleared elsewhere in the picker.
	const scope = box.closest('.picker') || box.closest('form') || document;
	scope.addEventListener('people-sync', draw);
	scope.addEventListener('change', (e) => !box.contains(e.target) && draw());
	draw();
}

for (const select of document.querySelectorAll('select[data-person]')) personSelect(select);
for (const box of document.querySelectorAll('[data-pick-people]')) peopleList(box);

// Meeting form: picking a start time sets the end an hour later, until someone picks the end themselves.
for (const start of document.querySelectorAll('input[type=time][name=time]')) {
	const end = start.form?.querySelector('input[type=time][name=end_time]');
	if (!end) continue;
	let auto = !end.value;
	end.addEventListener('change', () => (auto = false));
	start.addEventListener('change', () => {
		if (!auto) return;
		const [h, m] = start.value.split(':').map(Number);
		const later = start.value && `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		end.value = start.value && h < 23 ? later : '';
	});
}

// Meeting form: Sunday meetings are at the Wisconsin Entrepreneurship Hub, so a Sunday date fills in
// the location when it's empty.
const SUNDAY_ROOM = 'Wisconsin Entrepreneurship Hub 2nd floor (1403 University Ave)';
for (const date of document.querySelectorAll('form input[type=date][name=date]')) {
	const where = date.form.querySelector('input[name=location]');
	if (!where) continue;
	const fill = () => {
		if (!where.value.trim() && date.value && new Date(`${date.value}T12:00`).getDay() === 0) where.value = SUNDAY_ROOM;
	};
	date.addEventListener('change', fill);
	fill();
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

// Website editor: lists can be added to, reordered and trimmed, and on save the whole
// form is written into one JSON field that the server checks against the schema.
for (const form of document.querySelectorAll('[data-site-form]')) {
	const root = form.querySelector('[data-site-root]');
	const CONTAINER = '[data-obj], [data-item], [data-site-root]';
	const ownFields = (box) => [...box.querySelectorAll('[data-k]')].filter((el) => el.parentElement.closest(CONTAINER) === box);
	const items = (list) => [...list.querySelector(':scope > [data-items]').children].filter((el) => el.matches('[data-item]'));
	const read = (el) => {
		if (el.matches('[data-obj]')) return readObj(el);
		if (el.matches('[data-list]')) {
			return el.matches('[data-strings]') ? items(el).map((li) => li.querySelector('[data-k]').value) : items(el).map(readObj);
		}
		return el.type === 'checkbox' ? el.checked : el.value;
	};
	const readObj = (box) => Object.fromEntries(ownFields(box).map((el) => [el.dataset.k, read(el)]));
	const count = (list) => {
		const n = list.querySelector(':scope > .site-list-head [data-count]');
		if (n) n.textContent = items(list).length;
	};
	const titleOf = (item) => {
		const span = item.querySelector(':scope > details > summary [data-item-title]');
		if (!span?.dataset.titleKey) return;
		const body = item.querySelector(':scope > details > .site-item-body');
		const input = ownFields(item).find((el) => el.dataset.k === span.dataset.titleKey);
		if (input && body?.contains(input)) span.textContent = input.value.trim() || span.dataset.fallback;
	};
	let dirty = false;
	root.addEventListener('input', (e) => {
		dirty = true;
		const item = e.target.closest('[data-item]');
		if (item) titleOf(item);
	});
	root.addEventListener('change', (e) => {
		dirty = true;
		// A team's head and leads, as the site will show them.
		if (e.target.matches('[data-team-select]')) {
			const line = e.target.parentElement.querySelector('[data-team-people]');
			if (line) line.textContent = e.target.selectedOptions[0]?.dataset.people ?? '';
		}
	});
	root.addEventListener('click', (e) => {
		const add = e.target.closest('[data-add]');
		if (add) {
			const list = add.closest('[data-list]');
			const tpl = list.querySelector(':scope > template[data-tpl]');
			const box = list.querySelector(':scope > [data-items]');
			box.append(tpl.content.cloneNode(true));
			const added = box.lastElementChild;
			count(list);
			dirty = true;
			added.querySelector('input, textarea')?.focus();
			return;
		}
		const item = e.target.closest('[data-item]');
		if (!item) return;
		if (e.target.closest('[data-remove]')) {
			const list = item.closest('[data-list]');
			item.remove();
			count(list);
			dirty = true;
		} else if (e.target.closest('[data-move]')) {
			const up = e.target.closest('[data-move]').dataset.move === '-1';
			const sibling = up ? item.previousElementSibling : item.nextElementSibling;
			if (!sibling) return;
			up ? sibling.before(item) : sibling.after(item);
			e.target.closest('[data-move]').focus();
			dirty = true;
		}
	});
	form.addEventListener('submit', () => {
		form.querySelector('input[name="data"]').value = JSON.stringify(readObj(root));
		dirty = false;
	});
	window.addEventListener('beforeunload', (e) => {
		if (dirty) e.preventDefault();
	});
	// Grow text boxes with what's typed.
	const fit = (t) => {
		t.style.height = 'auto';
		t.style.height = `${t.scrollHeight + 2}px`;
	};
	root.addEventListener('input', (e) => e.target.matches('textarea') && fit(e.target));
	root.addEventListener('toggle', (e) => e.target.open && e.target.querySelectorAll('textarea').forEach(fit), true);
	root.querySelectorAll('textarea').forEach((t) => t.offsetParent && fit(t));
	// The change note is one line that wraps on narrow screens; Enter still saves, as it did.
	const note = form.querySelector('[data-note]');
	note?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			form.requestSubmit();
		}
	});
}
