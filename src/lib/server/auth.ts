import { json, type RequestEvent } from '@sveltejs/kit';

const passcodeHeader = 'x-hakuba-passcode';
const passcodeHash = '1c94f771674ff1e88ae07659d26e442c';

export function authorize(event: RequestEvent) {
	const provided = event.request.headers.get(passcodeHeader);
	if (!provided || md5(provided) !== passcodeHash) {
		return json({ message: '口令不正确' }, { status: 401 });
	}

	return null;
}

export function getDatabase(event: RequestEvent) {
	const db = event.platform?.env.DB;
	if (!db) {
		return null;
	}
	return db;
}

function md5(input: string) {
	const bytes = new TextEncoder().encode(input);
	const words: number[] = [];

	for (let i = 0; i < bytes.length; i += 1) {
		words[i >> 2] |= bytes[i] << ((i % 4) * 8);
	}

	const bitLength = bytes.length * 8;
	words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
	words[(((bytes.length + 8) >> 6) << 4) + 14] = bitLength;

	let a = 0x67452301;
	let b = 0xefcdab89;
	let c = 0x98badcfe;
	let d = 0x10325476;

	for (let i = 0; i < words.length; i += 16) {
		const oldA = a;
		const oldB = b;
		const oldC = c;
		const oldD = d;

		for (let j = 0; j < 64; j += 1) {
			let f: number;
			let g: number;

			if (j < 16) {
				f = (b & c) | (~b & d);
				g = j;
			} else if (j < 32) {
				f = (d & b) | (~d & c);
				g = (5 * j + 1) % 16;
			} else if (j < 48) {
				f = b ^ c ^ d;
				g = (3 * j + 5) % 16;
			} else {
				f = c ^ (b | ~d);
				g = (7 * j) % 16;
			}

			const next = d;
			d = c;
			c = b;
			b = add32(
				b,
				rotateLeft(add32(add32(a, f), add32(md5Constants[j], words[i + g] || 0)), md5Shifts[j])
			);
			a = next;
		}

		a = add32(a, oldA);
		b = add32(b, oldB);
		c = add32(c, oldC);
		d = add32(d, oldD);
	}

	return [a, b, c, d].map(toHexLe).join('');
}

const md5Shifts = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
	20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
	10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const md5Constants = Array.from({ length: 64 }, (_, i) =>
	Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
);

function add32(a: number, b: number) {
	return (a + b) >>> 0;
}

function rotateLeft(value: number, shift: number) {
	return (value << shift) | (value >>> (32 - shift));
}

function toHexLe(value: number) {
	return [0, 8, 16, 24]
		.map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, '0'))
		.join('');
}
