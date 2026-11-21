// @ts-nocheck: the browser behaviors from the old app.js, kept as plain JavaScript.
// Browser behaviors, as Svelte actions: `use:name` on the element they belong to. Each one runs when
// its element appears and cleans up when it goes, so they work across client-side navigation.

/** Library filters: hide items that don't match the chosen author or type. */
export function libraryFilters(filters) {
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
	return { destroy: () => filters.removeEventListener('change', apply) };
}

/** <input type=file name=file>: files over 8 MiB in total are refused before uploading. */
export function fileLimit(input) {
	const check = () => {
		input.setCustomValidity([...input.files].reduce((total, file) => total + file.size, 0) > 8 * 1024 * 1024 ? 'Choose files totaling no more than 8 MiB.' : '');
		if (input.validationMessage) input.reportValidity();
	};
	input.addEventListener('change', check);
	return { destroy: () => input.removeEventListener('change', check) };
}

/** A form that submits as soon as its select changes. */
export function submitOnSelect(form) {
	const go = (e) => {
		if (e.target.tagName === 'SELECT') form.requestSubmit();
	};
	form.addEventListener('change', go);
	return { destroy: () => form.removeEventListener('change', go) };
}

/** Drag a card to another column to move it. */
export function kanban(board) {
	let dragged = null;
	const clear = () => {
		for (const item of board.querySelectorAll('.is-drop-target')) item.classList.remove('is-drop-target');
	};
	const start = (event) => {
		const card = event.target.closest('[data-board-draggable]');
		if (!card || !board.contains(card)) return;
		dragged = card;
		card.classList.add('is-dragging');
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', 'task');
	};
	const over = (event) => {
		const column = event.target.closest('[data-board-stage]');
		if (!dragged || !column || !board.contains(column)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		clear();
		column.classList.add('is-drop-target');
	};
	const drop = (event) => {
		const column = event.target.closest('[data-board-stage]');
		if (!dragged || !column || !board.contains(column)) return;
		event.preventDefault();
		const form = dragged.querySelector('[data-board-move]');
		const select = form?.querySelector('select[name="status"]');
		if (select && select.value !== column.dataset.boardStage) {
			select.value = column.dataset.boardStage;
			form.requestSubmit();
		}
	};
	const end = () => {
		dragged?.classList.remove('is-dragging');
		dragged = null;
		clear();
	};
	board.addEventListener('dragstart', start);
	board.addEventListener('dragover', over);
	board.addEventListener('drop', drop);
	board.addEventListener('dragend', end);
	return {
		destroy() {
			board.removeEventListener('dragstart', start);
			board.removeEventListener('dragover', over);
			board.removeEventListener('drop', drop);
			board.removeEventListener('dragend', end);
		}
	};
}

const tabKey = (event, index, count) =>
	event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : event.key === 'ArrowRight' ? (index + 1) % count : event.key === 'ArrowLeft' ? (index + count - 1) % count : null;

/** Tabs that switch panels in place. `{ url: true }` keeps the address in step with the tab. */
export function tabs(group, opts = {}) {
	const list = opts.url ? [...group.querySelectorAll(':scope > [role="tablist"] > [role="tab"]')] : [...group.querySelectorAll('[role="tab"]')];
	const select = (tab, updateUrl = false) => {
		for (const option of list) {
			const selected = option === tab;
			option.setAttribute('aria-selected', String(selected));
			option.tabIndex = selected ? 0 : -1;
			document.getElementById(option.getAttribute('aria-controls')).hidden = !selected;
		}
		if (updateUrl && tab.href) history.replaceState(history.state, '', tab.href);
	};
	const cleanups = [];
	for (const [index, tab] of list.entries()) {
		const click = (event) => {
			if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			select(tab, !!opts.url);
		};
		const key = (event) => {
			const next = tabKey(event, index, list.length);
			if (next === null) return;
			event.preventDefault();
			select(list[next], !!opts.url);
			list[next].focus();
		};
		tab.addEventListener('click', click);
		tab.addEventListener('keydown', key);
		cleanups.push(() => {
			tab.removeEventListener('click', click);
			tab.removeEventListener('keydown', key);
		});
	}
	if (opts.url) {
		const revealAnchor = () => {
			const target = document.getElementById(location.hash.slice(1));
			const panel = target?.closest('[role="tabpanel"]');
			if (!panel || !group.contains(panel)) return;
			select(list.find((tab) => tab.getAttribute('aria-controls') === panel.id));
			target.scrollIntoView({ block: 'start' });
		};
		revealAnchor();
		window.addEventListener('hashchange', revealAnchor);
		cleanups.push(() => window.removeEventListener('hashchange', revealAnchor));
	}
	return { destroy: () => cleanups.forEach((f) => f()) };
}

/** A button that opens the <dialog> it names, and gets focus back when it closes. */
export function opensDialog(button, id) {
	const open = () => {
		const dialog = document.getElementById(id);
		if (!(dialog instanceof HTMLDialogElement)) return;
		// The team board's new-task dialog starts in the column whose + was pressed, or To do.
		const status = id === 'new-team-task' && dialog.querySelector('input[name="status"]');
		if (status) status.value = button.dataset.boardAdd ?? 'open';
		dialog.showModal();
		dialog.addEventListener('close', () => button.focus(), { once: true });
	};
	button.addEventListener('click', open);
	return { destroy: () => button.removeEventListener('click', open) };
}

/** A <dialog> that closes when its backdrop is clicked. */
export function backdropClose(dialog) {
	const click = (e) => {
		if (e.target === dialog) dialog.close();
	};
	dialog.addEventListener('click', click);
	return { destroy: () => dialog.removeEventListener('click', click) };
}

/** A board assignment form needs at least one person or subteam before it posts. */
export function needsAssignee(form) {
	const error = form.querySelector('[data-assignment-error]');
	const change = () => {
		if (error) error.hidden = true;
	};
	const submit = (event) => {
		if (form.querySelector('input[name="person"]:checked, input[name="subteam"]:checked')) return;
		event.preventDefault();
		if (error) error.hidden = false;
		const first = form.querySelector('input[name="person"], input[name="subteam"]');
		// People are picked by typing, so focus that box rather than the hidden checkbox.
		(first?.closest('[data-pick-people]')?.previousElementSibling?.querySelector('.combo-input') ?? first)?.focus();
	};
	form.addEventListener('change', change);
	form.addEventListener('submit', submit);
	return {
		destroy() {
			form.removeEventListener('change', change);
			form.removeEventListener('submit', submit);
		}
	};
}

/** Shows a meeting's reason box, with the label for why it's needed. */
export function showReason(box, why) {
	box.querySelector('.label').textContent = why;
	box.hidden = false;
}

/** A meeting's reason box stays hidden until it's needed: on Cancel, or when the date or time changes. */
export function reasonBox(box) {
	const form = box.closest('form');
	const input = box.querySelector('input');
	const timing = ['date', 'time', 'end_time'].map((n) => form.elements[n]).filter(Boolean);
	const was = timing.map((el) => el.value);
	const change = (e) => {
		if (!timing.includes(e.target)) return;
		input.required = timing.some((el, i) => el.value !== was[i]);
		if (input.required) showReason(box, 'Reason for the new date or time');
		else if (!input.value.trim()) box.hidden = true;
	};
	form.addEventListener('change', change);
	return { destroy: () => form.removeEventListener('change', change) };
}

/** Page-wide listeners: confirm prompts, buttons that need a field, and menus that close. Runs once. */
export function globalBehaviors() {
	// Buttons that need a field filled in first: <button data-needs="reason"> (canceling a meeting).
	const needs = (e) => {
		const name = e.submitter?.dataset.needs;
		const field = name && e.target.querySelector(`[name=${name}]`);
		if (!field || field.value.trim()) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		const box = field.closest('[data-reason]');
		if (box) showReason(box, 'Reason for canceling');
		field.required = true;
		field.reportValidity();
		field.focus();
	};
	// Confirm destructive actions: <form data-confirm> or <button data-confirm>.
	const confirmIt = (e) => {
		const msg = e.submitter?.dataset.confirm || e.target.dataset.confirm;
		if (msg && !confirm(msg)) e.preventDefault();
	};
	// Dropdown menus close on outside clicks or Escape; inline disclosures stay open.
	const openMenus = () => document.querySelectorAll('details.menu[open]');
	const click = (e) => {
		for (const menu of openMenus()) if (!menu.contains(e.target)) menu.open = false;
	};
	const key = (e) => {
		if (e.key !== 'Escape') return;
		for (const menu of openMenus()) {
			menu.open = false;
			menu.querySelector('summary').focus();
		}
	};
	document.addEventListener('submit', needs);
	document.addEventListener('submit', confirmIt);
	document.addEventListener('click', click);
	document.addEventListener('keydown', key);
	return () => {
		document.removeEventListener('submit', needs);
		document.removeEventListener('submit', confirmIt);
		document.removeEventListener('click', click);
		document.removeEventListener('keydown', key);
	};
}

/** Meeting action items: "+ Another" clones a blank row. */
export function addRow(btn) {
	const click = () => {
		const rows = btn.closest('form').querySelector('[data-rows]');
		const last = rows.querySelector('[data-row]:last-child');
		const row = last.cloneNode(true);
		for (const c of row.querySelectorAll('.combo')) c.remove();
		for (const input of row.querySelectorAll('input:not([type=date]), select')) {
			input.value = '';
			input.required = false; // Extra lines are optional; blank ones are skipped.
		}
		rows.append(row);
		for (const select of row.querySelectorAll('select[data-person]')) personSelect(select);
		row.querySelector('input:not([type=hidden])').focus();
	};
	btn.addEventListener('click', click);
	return { destroy: () => btn.removeEventListener('click', click) };
}

/** Save only changed attendance entries, in order, so unrelated check-ins stay intact. */
export function attendanceAutosave(form) {
	let pending = Promise.resolve();
	const status = form.querySelector('[data-attendance-status]');
	const save = (entries) => {
		if (!status) {
			form.requestSubmit();
			return;
		}
		status.textContent = 'Saving…';
		pending = pending
			.then(async () => {
				const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(entries) });
				if (!response.ok || !response.url.includes('ok=attendance')) throw new Error('Save failed');
			})
			.then(() => {
				status.textContent = 'Saved';
			})
			.catch(() => {
				status.textContent = 'Could not save attendance. Please try again.';
			});
	};
	const change = (event) => {
		const input = event.target;
		if (input.matches('input[type="radio"]:checked')) save([[input.name, input.value]]);
	};
	const all = () => save([...form.querySelectorAll('input[type="radio"][value="present"]:checked')].map((input) => [input.name, input.value]));
	form.addEventListener('change', change);
	form.addEventListener('attendance-mark-all', all);
	return {
		destroy() {
			form.removeEventListener('change', change);
			form.removeEventListener('attendance-mark-all', all);
		}
	};
}

/** Attendance: mark everyone present in one click. */
export function allPresent(btn) {
	const click = () => {
		for (const radio of btn.form.querySelectorAll('input[type=radio][value=present]')) radio.checked = true;
		btn.form.dispatchEvent(new Event('attendance-mark-all'));
	};
	btn.addEventListener('click', click);
	return { destroy: () => btn.removeEventListener('click', click) };
}

/** Keep the latest meeting's column in view when the attendance history first opens. */
export function scrollToEnd(details) {
	const toggle = () => {
		if (details.open) {
			const table = details.querySelector('.table-scroll');
			if (table) table.scrollLeft = table.scrollWidth;
		}
	};
	details.addEventListener('toggle', toggle, { once: true });
	return { destroy: () => details.removeEventListener('toggle', toggle) };
}

/**
 * People pickers (assign a task, who a meeting is for): ticking a team ticks everyone on it, and
 * unticking it unticks them unless another ticked team still has them. Unticking the last person
 * on a team unticks the team. Whole club ticks everyone and locks the list, since a club event is
 * open to all.
 */
export function picker(node) {
	const boxes = [...node.querySelectorAll('.picker-list input[type=checkbox]')];
	const teams = [...node.querySelectorAll('.picker-teams input[type=checkbox]')];
	const club = teams.find((t) => t.value === 'club');
	const count = node.querySelector('[data-picker-count]');
	const on = (box, team) => team === club || !!box.closest('label').dataset.teams?.split(' ').includes(team.value);
	const members = (team) => boxes.filter((b) => on(b, team));
	const sync = () => {
		for (const b of boxes) b.disabled = !!club?.checked;
		if (count) {
			const n = boxes.filter((b) => b.checked).length;
			count.textContent = n === 1 ? '1 person' : `${n} people`;
		}
		node.dispatchEvent(new Event('people-sync', { bubbles: true }));
	};
	if (teams.length) {
		// Tells the server the people list matches the teams, so anyone unticked was left out on purpose.
		node.append(Object.assign(document.createElement('input'), { type: 'hidden', name: 'people_synced', value: '1' }));
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
	node.querySelector('[data-picker-clear]')?.addEventListener('click', () => {
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
			list.append(Object.assign(document.createElement('li'), { className: 'combo-none', textContent: q ? 'No one matches' : 'No one left to add' }));
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

/** <select data-person>: a box you type a name into. */
export function personSelect(select) {
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
		for (const label of document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`))
			label.addEventListener('click', (e) => {
				e.preventDefault();
				input.focus();
			});
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
	return { destroy: () => wrap.remove() };
}

/** [data-pick-people]: ticked boxes shown as chips, with a box to type more names into. */
export function peopleList(box) {
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
	const other = (e) => !box.contains(e.target) && draw();
	scope.addEventListener('people-sync', draw);
	scope.addEventListener('change', other);
	draw();
	return {
		destroy() {
			scope.removeEventListener('people-sync', draw);
			scope.removeEventListener('change', other);
			field.remove();
		}
	};
}

const SUNDAY_ROOM = 'Wisconsin Entrepreneurship Hub 2nd floor (1403 University Ave)';

/**
 * Meeting form: picking a start time sets the end an hour later, until someone picks the end
 * themselves; a Sunday date fills in the Sunday room when the location is empty.
 */
export function meetingTimes(form) {
	const start = form.querySelector('input[type=time][name=time]');
	const end = form.querySelector('input[type=time][name=end_time]');
	if (start && end) {
		let auto = !end.value;
		end.addEventListener('change', () => (auto = false));
		start.addEventListener('change', () => {
			if (!auto) return;
			const [h, m] = start.value.split(':').map(Number);
			const later = start.value && `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
			end.value = start.value && h < 23 ? later : '';
		});
	}
	const date = form.querySelector('input[type=date][name=date]');
	const where = form.querySelector('input[name=location]');
	if (date && where) {
		const fill = () => {
			if (!where.value.trim() && date.value && new Date(`${date.value}T12:00`).getDay() === 0) where.value = SUNDAY_ROOM;
		};
		date.addEventListener('change', fill);
		fill();
	}
}

/** Form screen: the response count refreshes every few seconds. "People here" makes it "12 of 40". */
export function liveCount(count) {
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
	const timer = setInterval(async () => {
		try {
			const res = await fetch(count.dataset.liveCount, { headers: { Accept: 'application/json' } });
			if (res.ok) count.textContent = (await res.json()).count;
			show();
		} catch {}
	}, 3000);
	return { destroy: () => clearInterval(timer) };
}

/**
 * Website editor: lists can be added to, reordered and trimmed, and on save the whole form is
 * written into one JSON field that the server checks against the schema.
 */
export function siteForm(form) {
	const root = form.querySelector('[data-site-root]');
	const CONTAINER = '[data-obj], [data-item], [data-site-root]';
	const ownFields = (box) => [...box.querySelectorAll('[data-k]')].filter((el) => el.parentElement.closest(CONTAINER) === box);
	const items = (list) => [...list.querySelector(':scope > [data-items]').children].filter((el) => el.matches('[data-item]'));
	const read = (el) => {
		if (el.matches('[data-obj]')) return readObj(el);
		if (el.matches('[data-list]')) return el.matches('[data-strings]') ? items(el).map((li) => li.querySelector('[data-k]').value) : items(el).map(readObj);
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
	// Also on the form, so the page can warn before an in-app link leaves unsaved changes.
	const mark = (on) => {
		dirty = on;
		form.toggleAttribute('data-dirty', on);
	};
	root.addEventListener('input', (e) => {
		mark(true);
		const item = e.target.closest('[data-item]');
		if (item) titleOf(item);
	});
	root.addEventListener('change', (e) => {
		mark(true);
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
			mark(true);
			added.querySelector('input, textarea')?.focus();
			return;
		}
		const item = e.target.closest('[data-item]');
		if (!item) return;
		if (e.target.closest('[data-remove]')) {
			const list = item.closest('[data-list]');
			item.remove();
			count(list);
			mark(true);
		} else if (e.target.closest('[data-move]')) {
			const up = e.target.closest('[data-move]').dataset.move === '-1';
			const sibling = up ? item.previousElementSibling : item.nextElementSibling;
			if (!sibling) return;
			up ? sibling.before(item) : sibling.after(item);
			e.target.closest('[data-move]').focus();
			mark(true);
		}
	});
	form.addEventListener('submit', () => {
		form.querySelector('input[name="data"]').value = JSON.stringify(readObj(root));
		mark(false);
	});
	const leave = (e) => {
		if (dirty) e.preventDefault();
	};
	window.addEventListener('beforeunload', leave);
	// Grow text boxes with what's typed.
	const fit = (t) => {
		t.style.height = 'auto';
		t.style.height = `${t.scrollHeight + 2}px`;
	};
	root.addEventListener('input', (e) => e.target.matches('textarea') && fit(e.target));
	root.addEventListener('toggle', (e) => e.target.open && e.target.querySelectorAll('textarea').forEach(fit), true);
	root.querySelectorAll('textarea').forEach((t) => t.offsetParent && fit(t));
	// The change note is one line that wraps on narrow screens; Enter still saves, as it did.
	form.querySelector('[data-note]')?.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			form.requestSubmit();
		}
	});
	return { destroy: () => window.removeEventListener('beforeunload', leave) };
}

/** A saved email on its Email history page grows to its full height instead of scrolling in a box. */
export function fitFrame(frame) {
	const fit = () => {
		const body = frame.contentDocument?.body;
		if (body) frame.style.height = `${body.scrollHeight}px`;
	};
	frame.addEventListener('load', fit);
	addEventListener('resize', fit);
	fit();
	return { destroy: () => removeEventListener('resize', fit) };
}
