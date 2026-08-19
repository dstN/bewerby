/**
 * Builds a minimal, valid single-page PDF with a real text layer, entirely
 * in memory - no binary fixture needs to be checked into the repo (matching
 * the approach already used for ad hoc verification in earlier issues).
 * pdf.js can open and extract text from this via getTextContent().
 */
export function makeMinimalPdf(lines: string[]): Buffer {
	const escape = (line: string) => line.replace(/([()\\])/g, '\\$1');
	const contentOps = lines
		.map((line, i) =>
			i === 0 ? `72 720 Td (${escape(line)}) Tj` : `0 -18 Td (${escape(line)}) Tj`
		)
		.join(' ');
	const content = `BT /F1 12 Tf ${contentOps} ET`;

	const objects: string[] = [];
	objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
	objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
	objects[3] =
		'<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>';
	objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
	objects[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [0];
	for (let i = 1; i <= 5; i++) {
		offsets[i] = Buffer.byteLength(pdf, 'latin1');
		pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
	}
	const xrefOffset = Buffer.byteLength(pdf, 'latin1');
	pdf += 'xref\n0 6\n0000000000 65535 f \n';
	for (let i = 1; i <= 5; i++) {
		pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

	return Buffer.from(pdf, 'latin1');
}
