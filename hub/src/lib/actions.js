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

/** <input type=file name=file>: files over the limit (8 MiB unless given) in total are refused before uploading. */
export function fileLimit(input, limit = 8 * 1024 * 1024) {
	const check = () => {
		input.setCustomValidity([...input.files].reduce((total, file) => total + file.size, 0) > limit ? `Choose files totaling no more than ${limit / 1024 / 1024} MiB.` : '');
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

// ---------- an email in a frame ----------

const SVG = 'http://www.w3.org/2000/svg';

/** [r, g, b, a] from a computed color like "rgb(0, 0, 0)" or "rgba(0 0 0 / 0.5)"; null for anything else. */
function parseColor(value) {
	const m = /^rgba?\(([^)]+)\)$/.exec(value);
	if (!m) return null;
	const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
	return p.length >= 3 && p.every((n) => !Number.isNaN(n)) ? [p[0], p[1], p[2], p[3] ?? 1] : null;
}

// OKLab, so lightness can flip while the hue stays the same.
const toLinear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklab([r, g, b]) {
	[r, g, b] = [toLinear(r), toLinear(g), toLinear(b)];
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
function cssColor({ L, a, b }, alpha = 1) {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const [r, g, bl] = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(
		(c) => Math.round(toGamma(Math.min(1, Math.max(0, c))))
	);
	return alpha < 1 ? `rgba(${r}, ${g}, ${bl}, ${alpha})` : `rgb(${r}, ${g}, ${bl})`;
}
const chroma = (c) => Math.hypot(c.a, c.b);

/** A light background turned dark, the way Outlook's dark mode does: white becomes the card, other colors keep their hue. */
function darkBackground(c, paper) {
	if (c.L < 0.5) return c;
	const L = paper.L + (1 - c.L) * 0.6;
	if (chroma(c) < 0.03) return { L, a: paper.a, b: paper.b };
	const k = Math.min(0.8, (L / c.L) * 1.3);
	return { L, a: c.a * k, b: c.b * k };
}

/** Dark text turned light; any text kept readable on the background it now sits on. */
function lightText(c, ink, behind) {
	let { L, a, b } = c;
	if (L < 0.62) {
		L = ink.L - L * ((ink.L - 0.62) / 0.62);
		if (chroma(c) < 0.03) ({ a, b } = ink);
	}
	if (L - behind < 0.4) L = Math.min(ink.L, behind + 0.45);
	return { L, a, b };
}

/** A line color: light rules go dark like backgrounds, dark ones go light. */
const lineColor = (c, paper) => (c.L >= 0.5 ? { ...darkBackground(c, paper), L: darkBackground(c, paper).L + 0.06 } : { ...c, L: 0.75 - c.L * 0.3 });

/**
 * Turns an email's colors dark like Outlook and Gmail do in dark mode: light backgrounds go dark and
 * dark text goes light, keeping each color's hue. Pictures, and anything drawn over a background
 * picture, stay as they are.
 */
function darken(doc, frame) {
	const view = doc.defaultView;
	let paperRgb = null;
	for (let el = frame.parentElement; el && !paperRgb; el = el.parentElement) {
		const c = parseColor(getComputedStyle(el).backgroundColor);
		if (c && c[3] > 0.5) paperRgb = c;
	}
	const paper = oklab(paperRgb ?? [28, 25, 22]);
	const ink = oklab(parseColor(getComputedStyle(frame).color) ?? [246, 241, 230]);
	doc.documentElement.style.setProperty('background-color', cssColor(paper), 'important');
	doc.documentElement.style.setProperty('color', cssColor(ink), 'important');

	const behind = new Map([[doc.documentElement, paper.L]]);
	const left = new Set();
	const changes = [];
	for (const el of [doc.body, ...doc.body.querySelectorAll('*')]) {
		const parent = el.parentElement;
		if (left.has(parent) || (el.namespaceURI === SVG && el.localName !== 'svg')) {
			left.add(el);
			continue;
		}
		const cs = view.getComputedStyle(el);
		if (cs.backgroundImage !== 'none') {
			left.add(el);
			continue;
		}
		const set = [];
		let under = behind.get(parent) ?? paper.L;
		const bg = parseColor(cs.backgroundColor);
		if (bg && bg[3] > 0) {
			const dark = darkBackground(oklab(bg), paper);
			set.push(['background-color', cssColor(dark, bg[3])]);
			if (bg[3] > 0.5) under = dark.L;
		}
		behind.set(el, under);
		const fg = parseColor(cs.color);
		if (fg) set.push(['color', cssColor(lightText(oklab(fg), ink, under), fg[3])]);
		for (const side of ['top', 'right', 'bottom', 'left']) {
			if (cs.getPropertyValue(`border-${side}-style`) === 'none' || !parseFloat(cs.getPropertyValue(`border-${side}-width`))) continue;
			const line = parseColor(cs.getPropertyValue(`border-${side}-color`));
			if (line && line[3] > 0) set.push([`border-${side}-color`, cssColor(lineColor(oklab(line), paper), line[3])]);
		}
		changes.push([el, set]);
	}
	// All read first, then all written, so the page lays out once.
	for (const [el, set] of changes) for (const [prop, value] of set) el.style.setProperty(prop, value, 'important');
}

const QUOTE_STARTS = '.gmail_quote, blockquote[type="cite"], .moz-cite-prefix, .yahoo_quoted, [id^="yahoo_quoted"], .protonmail_quote, blockquote';
// Outlook's reply header ("From: … Sent: …"): everything after it is the earlier email.
const OUTLOOK_STARTS = '#appendonsend, #divRplyFwdMsg, [id^="mail-editor-reference-message"]';

/** Where Outlook's quoted email starts: its reply header, a "----- Original Message -----" line, or a bold "From:" over "Sent:". */
function outlookStart(doc) {
	const body = doc.body;
	const found = [
		body.querySelector(OUTLOOK_STARTS),
		[...body.querySelectorAll('div[style*="border-top"]')].find((d) => /^\s*From:/.test(d.textContent) && /\b(Sent|Date):/.test(d.textContent))
	];
	const walk = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
	for (let n = walk.nextNode(); n; n = walk.nextNode()) {
		if (/^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i.test(n.textContent)) {
			found.push(n);
			break;
		}
	}
	const after = doc.createRange();
	found.push(
		[...body.querySelectorAll('b, strong')].find((b) => {
			if (b.textContent.trim() !== 'From:') return false;
			after.setStartAfter(b);
			after.setEnd(body, body.childNodes.length);
			return /\b(Sent|Date):/.test(after.toString().slice(0, 400));
		})
	);
	// The first one in the email.
	return found.filter(Boolean).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0] ?? null;
}

/**
 * Folds the earlier emails a reply quotes at its end behind a "•••" button, like Gmail and Outlook.
 * Quotes with writing after them (answers between the lines) and forwarded emails stay open.
 */
function foldQuotes(doc) {
	const body = doc.body;
	const range = doc.createRange();
	const shows = (r) => r.toString().trim() !== '' || !!r.cloneContents().querySelector('img');
	const attribution = (el) => {
		let prev = el.previousSibling;
		while (prev && ((prev.nodeType === 3 && !prev.textContent.trim()) || prev.nodeName === 'BR')) prev = prev.previousSibling;
		return prev && prev.textContent.length < 400 && /\bwrote:\s*$/i.test(prev.textContent.trim()) ? prev : null;
	};

	let start = null;
	let last = null;
	let toEnd = false;
	for (const el of body.querySelectorAll(QUOTE_STARTS)) {
		const head = attribution(el);
		// A plain blockquote is a quote only under an "On … wrote:" line; newsletters use them for layout.
		if (el.localName === 'blockquote' && el.getAttribute('type') !== 'cite' && !head) continue;
		start = head ?? el;
		last = el.classList.contains('moz-cite-prefix') ? (el.nextElementSibling ?? el) : el;
		break;
	}
	const outlook = outlookStart(doc);
	if (outlook && (!start || outlook.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING)) {
		start = outlook.previousElementSibling?.localName === 'hr' ? outlook.previousElementSibling : outlook;
		toEnd = true;
	}
	if (!start || /forwarded message/i.test(start.textContent.slice(0, 200))) return;

	// Only the end of the email folds, and only when the email has its own words above it.
	range.setStart(body, 0);
	range.setEndBefore(start);
	if (!shows(range) || /forwarded message:?$/i.test(range.toString().trim())) return;
	if (!toEnd) {
		range.setStartAfter(last);
		range.setEnd(body, body.childNodes.length);
		if (shows(range)) return;
	}
	range.setStartBefore(start);
	range.setEnd(body, body.childNodes.length);
	const details = doc.createElement('details');
	details.className = 'hub-quote';
	const summary = doc.createElement('summary');
	summary.textContent = '•••';
	summary.title = 'Show quoted text';
	details.append(summary, range.extractContents());
	body.append(details);
	const style = doc.createElement('style');
	style.textContent =
		'.hub-quote>summary{display:inline-block;list-style:none;margin:10px 0 4px;padding:0 10px;border-radius:6px;background:#2f2a25;color:#f6f1e6;font:700 12px/20px system-ui,sans-serif;letter-spacing:2px;cursor:pointer}.hub-quote>summary::-webkit-details-marker{display:none}.hub-quote>summary:hover{background:#48413a}';
	(doc.head ?? body).append(style);
}

/**
 * An email shown in a sandboxed frame, the way Outlook shows one in dark mode: its colors turned dark,
 * the earlier emails a reply quotes folded behind "•••" (fold: false leaves them), and the frame as
 * tall as the email instead of scrolling in a box. Nothing runs inside the frame; the page does this.
 */
export function mailFrame(frame, opts = {}) {
	let ready = null;
	let observer = null;
	const fit = () => {
		const doc = frame.contentDocument;
		if (!doc?.documentElement || !doc.body) return;
		const height = doc.compatMode === 'CSS1Compat' ? doc.documentElement.getBoundingClientRect().height : doc.body.scrollHeight;
		frame.style.height = `${Math.ceil(height)}px`;
	};
	const setup = () => {
		const doc = frame.contentDocument;
		if (!doc?.body || doc === ready) return;
		ready = doc;
		try {
			if (opts.fold !== false) foldQuotes(doc);
			darken(doc, frame);
		} catch (e) {
			console.error(e);
		}
		frame.style.visibility = 'visible';
		observer?.disconnect();
		observer = new ResizeObserver(fit);
		observer.observe(doc.documentElement);
		// Opening "•••" and pictures arriving change the height.
		doc.addEventListener('toggle', () => setTimeout(fit), true);
		doc.addEventListener('load', fit, true);
		fit();
	};
	frame.addEventListener('load', setup);
	addEventListener('resize', fit);
	if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.URL === 'about:srcdoc') setup();
	return {
		destroy: () => {
			observer?.disconnect();
			removeEventListener('resize', fit);
		}
	};
}
