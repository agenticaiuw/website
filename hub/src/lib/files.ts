/** What kind of file a name is, for library lists and filters. */
export function fileKind(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	if (['doc', 'docx'].includes(ext)) return 'Word document';
	if (['ppt', 'pptx'].includes(ext)) return 'PowerPoint';
	if (['xls', 'xlsx'].includes(ext)) return 'Excel spreadsheet';
	if (ext === 'pdf') return 'PDF';
	if (ext === 'txt') return 'Text file';
	if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'Image';
	if (['wav', 'mp3', 'ogg', 'flac', 'm4a'].includes(ext)) return 'Audio';
	return 'File';
}
