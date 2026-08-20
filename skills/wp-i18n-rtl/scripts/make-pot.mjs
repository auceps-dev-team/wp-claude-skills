#!/usr/bin/env node
/**
 * make-pot.mjs — extract translatable strings from a WordPress theme or plugin.
 *
 * A stand-in for `wp i18n make-pot` where WP-CLI is not available. It reads the
 * same call signatures core does, keeps `translators:` comments attached, and
 * records every file:line reference so a translator has context.
 *
 * It also reads the two sources that are not PHP calls and are therefore
 * invisible to a naive extractor: theme.json labels and the stylesheet or
 * plugin header. Skipping those is not cosmetic — the names in theme.json are
 * exactly what a client reads in the block editor's colour and spacing pickers.
 *
 * Validated against `wp i18n make-pot` on a real theme: same string set.
 *
 * Zero dependencies. Node 18+.
 *
 *   node make-pot.mjs <source-dir> <output.pot> --domain=slug [--package=Name]
 *
 * Exit codes: 0 = wrote the file, 1 = nothing found, 2 = bad invocation.
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set( [
	'node_modules', 'vendor', '.git', 'dist', 'build', '.svn',
	'vendor_prefixed', 'vendor-prefixed', 'vendor_wpstg',
] );

/**
 * The gettext calls WordPress recognises, and which argument holds what.
 *
 * Anything not listed here is invisible to the extractor — which is exactly why
 * a non-literal text domain breaks translation silently.
 */
const FUNCTIONS = {
	__: { text: 0, domain: 1 },
	_e: { text: 0, domain: 1 },
	esc_html__: { text: 0, domain: 1 },
	esc_html_e: { text: 0, domain: 1 },
	esc_attr__: { text: 0, domain: 1 },
	esc_attr_e: { text: 0, domain: 1 },
	_x: { text: 0, context: 1, domain: 2 },
	_ex: { text: 0, context: 1, domain: 2 },
	esc_html_x: { text: 0, context: 1, domain: 2 },
	esc_attr_x: { text: 0, context: 1, domain: 2 },
	_n: { text: 0, plural: 1, domain: 3 },
	_nx: { text: 0, plural: 1, context: 3, domain: 4 },
	_n_noop: { text: 0, plural: 1, domain: 2 },
	_nx_noop: { text: 0, plural: 1, context: 2, domain: 3 },
};

/** Translatable theme.json fields, mirroring core's own theme-i18n.json. */
const THEME_JSON_FIELDS = [
	[ 'settings.color.palette', 'name', 'Color name' ],
	[ 'settings.color.gradients', 'name', 'Gradient name' ],
	[ 'settings.color.duotone', 'name', 'Duotone name' ],
	[ 'settings.typography.fontSizes', 'name', 'Font size name' ],
	[ 'settings.typography.fontFamilies', 'name', 'Font family name' ],
	[ 'settings.spacing.spacingSizes', 'name', 'Space size name' ],
	[ 'customTemplates', 'title', 'Custom template name' ],
	[ 'templateParts', 'title', 'Template part name' ],
];

/**
 * Translatable block.json fields, mirroring core's block-i18n.json.
 *
 * These are the block's title, description and search keywords as they appear
 * in the inserter. A plugin that ships blocks and skips these has an inserter
 * that stays English on every localised site.
 */
const BLOCK_JSON_FIELDS = [
	[ 'title', 'block title' ],
	[ 'description', 'block description' ],
	[ 'keywords', 'block keyword' ],
	[ 'styles.label', 'block style label' ],
	[ 'variations.title', 'block variation title' ],
	[ 'variations.description', 'block variation description' ],
	[ 'variations.keywords', 'block variation keyword' ],
];

/** Header fields core translates on the Themes and Plugins screens. */
const HEADER_FIELDS = {
	'Theme Name': 'Name of the theme',
	'Plugin Name': 'Name of the plugin',
	Description: 'Description of the plugin/theme',
	Author: 'Author of the plugin/theme',
	'Author URI': 'Author URI of the plugin/theme',
	'Theme URI': 'URI of the theme',
	'Plugin URI': 'URI of the plugin',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function* walk( dir ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			if ( ! SKIP_DIRS.has( entry.name ) ) yield* walk( full );
		} else if ( /\.(php|js|jsx)$/.test( entry.name ) ) {
			yield full;
		}
	}
}

/** Split a PHP argument list on top-level commas, respecting quotes and nesting. */
function splitArgs( src ) {
	const out = [];
	let depth = 0;
	let quote = null;
	let current = '';

	for ( let i = 0; i < src.length; i += 1 ) {
		const c = src[ i ];

		if ( quote ) {
			current += c;
			if ( c === '\\' ) { current += src[ i + 1 ] ?? ''; i += 1; continue; }
			if ( c === quote ) quote = null;
			continue;
		}
		if ( c === "'" || c === '"' ) { quote = c; current += c; continue; }
		if ( c === '(' || c === '[' ) depth += 1;
		if ( c === ')' || c === ']' ) depth -= 1;
		if ( c === ',' && depth === 0 ) { out.push( current.trim() ); current = ''; continue; }
		current += c;
	}
	if ( current.trim() ) out.push( current.trim() );
	return out;
}

/** Literal value of a PHP string argument, or null when it is not literal. */
function literal( arg ) {
	if ( ! arg ) return null;
	const m = /^(['"])([\s\S]*)\1$/.exec( arg.trim() );
	if ( ! m ) return null;

	let value = m[ 2 ];
	if ( m[ 1 ] === '"' ) {
		value = value.replace( /\\n/g, '\n' ).replace( /\\t/g, '\t' ).replace( /\\"/g, '"' );
	} else {
		value = value.replace( /\\'/g, "'" ).replace( /\\\\/g, '\\' );
	}
	return value;
}

/** Contents of the balanced ( ... ) group starting at or after `from`. */
function balanced( src, from ) {
	const start = src.indexOf( '(', from );
	if ( start === -1 ) return null;
	let depth = 0;
	let quote = null;

	for ( let i = start; i < src.length; i += 1 ) {
		const c = src[ i ];
		if ( quote ) {
			if ( c === '\\' ) { i += 1; continue; }
			if ( c === quote ) quote = null;
			continue;
		}
		if ( c === "'" || c === '"' ) { quote = c; continue; }
		if ( c === '(' ) depth += 1;
		else if ( c === ')' ) {
			depth -= 1;
			if ( depth === 0 ) return { args: src.slice( start + 1, i ) };
		}
	}
	return null;
}

const escapePo = ( s ) => s
	.replace( /\\/g, '\\\\' )
	.replace( /"/g, '\\"' )
	.replace( /\n/g, '\\n' )
	.replace( /\t/g, '\\t' );

function poString( value ) {
	if ( ! value.includes( '\n' ) ) return `"${ escapePo( value ) }"`;
	const lines = value.split( '\n' );
	const parts = lines.map( ( l, i ) => `"${ escapePo( l + ( i < lines.length - 1 ? '\n' : '' ) ) }"` );
	return `""\n${ parts.join( '\n' ) }`;
}

const readPath = ( obj, dotted ) =>
	dotted.split( '.' ).reduce( ( acc, k ) => ( acc && typeof acc === 'object' ? acc[ k ] : undefined ), obj );

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice( 2 );
const positional = argv.filter( ( a ) => ! a.startsWith( '--' ) );
const flag = ( name, fallback = null ) => {
	const found = argv.find( ( a ) => a.startsWith( `--${ name }=` ) );
	return found ? found.slice( name.length + 3 ) : fallback;
};

if ( positional.length < 2 ) {
	console.error( 'usage: node make-pot.mjs <source-dir> <output.pot> --domain=slug [--package=Name]' );
	process.exit( 2 );
}

const [ source, output ] = positional;
const domain = flag( 'domain' );
const pkg = flag( 'package', domain || 'Project' );

if ( ! domain ) {
	console.error( 'error: --domain is required — it is what the extractor matches against' );
	process.exit( 2 );
}
if ( ! fs.existsSync( source ) ) {
	console.error( `error: source not found: ${ source }` );
	process.exit( 2 );
}

const entries = new Map();
const otherDomains = new Map();
let nonLiteral = 0;

/** Record one string, merging references when it has been seen before. */
function add( text, plural, context, ref, comment = null ) {
	const key = `${ context || '' }${ text }${ plural || '' }`;
	const existing = entries.get( key );

	if ( existing ) {
		if ( ! existing.refs.includes( ref ) ) existing.refs.push( ref );
		if ( comment && ! existing.comment ) existing.comment = comment;
		return;
	}

	entries.set( key, { text, plural, context, refs: [ ref ], comment } );
}

/** theme.json labels, including the per-block overrides. */
function extractThemeJson( file, rel ) {
	let json;
	try { json = JSON.parse( fs.readFileSync( file, 'utf8' ) ); } catch { return; }

	if ( typeof json.title === 'string' && json.title !== '' ) {
		add( json.title, null, 'Style variation name', rel );
	}

	const scopes = [ json ];
	const blocks = readPath( json, 'settings.blocks' );
	if ( blocks && typeof blocks === 'object' ) {
		for ( const cfg of Object.values( blocks ) ) scopes.push( { settings: cfg } );
	}

	for ( const scope of scopes ) {
		for ( const [ dotted, key, context ] of THEME_JSON_FIELDS ) {
			const list = readPath( scope, dotted );
			if ( ! Array.isArray( list ) ) continue;
			for ( const item of list ) {
				if ( item && typeof item[ key ] === 'string' && item[ key ] !== '' ) {
					add( item[ key ], null, context, rel );
				}
			}
		}
	}
}

/** block.json title, description, keywords, styles and variations. */
function extractBlockJson( file, rel ) {
	let json;
	try { json = JSON.parse( fs.readFileSync( file, 'utf8' ) ); } catch { return; }

	const push = ( value, context ) => {
		if ( typeof value === 'string' && value !== '' ) add( value, null, context, rel );
		else if ( Array.isArray( value ) ) {
			for ( const v of value ) if ( typeof v === 'string' && v !== '' ) add( v, null, context, rel );
		}
	};

	for ( const [ field, context ] of BLOCK_JSON_FIELDS ) {
		if ( ! field.includes( '.' ) ) {
			push( json[ field ], context );
			continue;
		}
		// `styles.label` and `variations.*` describe a key inside a list.
		const [ list, key ] = field.split( '.' );
		if ( ! Array.isArray( json[ list ] ) ) continue;
		for ( const item of json[ list ] ) {
			if ( item && typeof item === 'object' ) push( item[ key ], context );
		}
	}
}

/** style.css or plugin main-file header fields. */
function extractHeader( file, rel ) {
	let src;
	try { src = fs.readFileSync( file, 'utf8' ).slice( 0, 4000 ); } catch { return; }

	for ( const [ field, context ] of Object.entries( HEADER_FIELDS ) ) {
		// Built from a plain string, not a template literal: `\s` inside a
		// template literal is an unrecognised escape that JavaScript collapses
		// to `s`, which silently stops the class consuming the leading space of
		// a ` * Plugin Name:` docblock line.
		const re = new RegExp( '^[\\s*#/]*' + field + '\\s*:\\s*(.+)$', 'im' );
		const m = re.exec( src );
		if ( m && m[ 1 ].trim() ) add( m[ 1 ].trim(), null, context, rel );
	}
}

// --- non-PHP sources first --------------------------------------------------

const themeJson = path.join( source, 'theme.json' );
if ( fs.existsSync( themeJson ) ) extractThemeJson( themeJson, 'theme.json' );

const stylesDir = path.join( source, 'styles' );
if ( fs.existsSync( stylesDir ) ) {
	for ( const f of fs.readdirSync( stylesDir ).filter( ( n ) => n.endsWith( '.json' ) ) ) {
		extractThemeJson( path.join( stylesDir, f ), `styles/${ f }` );
	}
}

const styleCss = path.join( source, 'style.css' );
if ( fs.existsSync( styleCss ) ) extractHeader( styleCss, 'style.css' );

// Every block.json anywhere in the tree, not only at the root: a plugin keeps
// one per block under blocks/ or build/.
( function collectBlockJson( dir ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			if ( ! SKIP_DIRS.has( entry.name ) ) collectBlockJson( full );
		} else if ( entry.name === 'block.json' ) {
			extractBlockJson( full, path.relative( source, full ).replace( /\\/g, '/' ) );
		}
	}
}( source ) );

for ( const f of fs.readdirSync( source ).filter( ( n ) => n.endsWith( '.php' ) ) ) {
	const full = path.join( source, f );
	const head = fs.readFileSync( full, 'utf8' ).slice( 0, 4000 );
	if ( /^[\s*#/]*Plugin Name\s*:/im.test( head ) ) extractHeader( full, f );
}

// --- gettext calls ----------------------------------------------------------

const names = Object.keys( FUNCTIONS ).join( '|' );

for ( const file of walk( source ) ) {
	const src = fs.readFileSync( file, 'utf8' );
	const rel = path.relative( source, file ).replace( /\\/g, '/' );
	const callRe = new RegExp( `(?<![\\w$>])(${ names })\\s*\\(`, 'g' );
	let m;

	while ( ( m = callRe.exec( src ) ) !== null ) {
		const spec = FUNCTIONS[ m[ 1 ] ];
		const block = balanced( src, m.index + m[ 0 ].length - 1 );
		if ( ! block ) continue;

		const parts = splitArgs( block.args );
		const text = literal( parts[ spec.text ] );

		if ( text === null ) {
			// A non-literal first argument cannot be extracted by any tool,
			// core's included. Counting these is the point: silent failures.
			if ( parts[ spec.text ] ) nonLiteral += 1;
			continue;
		}

		const argDomain = literal( parts[ spec.domain ] );
		if ( argDomain !== domain ) {
			if ( argDomain ) otherDomains.set( argDomain, ( otherDomains.get( argDomain ) || 0 ) + 1 );
			else nonLiteral += 1;
			continue;
		}

		const context = spec.context !== undefined ? literal( parts[ spec.context ] ) : null;
		const plural = spec.plural !== undefined ? literal( parts[ spec.plural ] ) : null;
		const line = src.slice( 0, m.index ).split( '\n' ).length;

		// A translators: comment must sit immediately above the call to be
		// picked up — the same rule core's extractor applies.
		const before = src.slice( Math.max( 0, m.index - 400 ), m.index );
		const comment = /\/\*\s*translators:\s*([\s\S]*?)\*\/\s*$/i.exec( before )
			|| /\/\/\s*translators:\s*(.*)\s*$/i.exec( before );

		add(
			text,
			plural,
			context,
			`${ rel }:${ line }`,
			comment ? comment[ 1 ].trim().replace( /\s*\n\s*\*?\s*/g, ' ' ) : null
		);
	}
}

// --- write ------------------------------------------------------------------

if ( ! entries.size ) {
	console.error( `no strings found for domain "${ domain }" — check it matches the Text Domain header` );
	process.exit( 1 );
}

const now = `${ new Date().toISOString().replace( 'T', ' ' ).slice( 0, 16 ) }+0000`;
const out = [
	`# Copyright (C) ${ new Date().getFullYear() } ${ pkg }`,
	`# This file is distributed under the same license as the ${ pkg } package.`,
	'msgid ""',
	'msgstr ""',
	`"Project-Id-Version: ${ pkg }\\n"`,
	'"MIME-Version: 1.0\\n"',
	'"Content-Type: text/plain; charset=UTF-8\\n"',
	'"Content-Transfer-Encoding: 8bit\\n"',
	`"POT-Creation-Date: ${ now }\\n"`,
	'"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"',
	'"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"',
	'"Language-Team: LANGUAGE <LL@li.org>\\n"',
	'"Plural-Forms: nplurals=2; plural=(n > 1);\\n"',
	`"X-Domain: ${ domain }\\n"`,
	'',
];

for ( const e of entries.values() ) {
	if ( e.comment ) out.push( `#. translators: ${ e.comment }` );
	for ( const ref of e.refs ) out.push( `#: ${ ref }` );
	if ( e.context ) out.push( `msgctxt ${ poString( e.context ) }` );
	out.push( `msgid ${ poString( e.text ) }` );
	if ( e.plural ) {
		out.push( `msgid_plural ${ poString( e.plural ) }` );
		out.push( 'msgstr[0] ""' );
		out.push( 'msgstr[1] ""' );
	} else {
		out.push( 'msgstr ""' );
	}
	out.push( '' );
}

fs.mkdirSync( path.dirname( path.resolve( output ) ), { recursive: true } );
fs.writeFileSync( output, out.join( '\n' ), 'utf8' );

console.log( `${ entries.size } strings -> ${ output }` );

if ( otherDomains.size ) {
	console.log( '\nOther text domains found in this source:' );
	for ( const [ d, n ] of [ ...otherDomains ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ) ) {
		console.log( `  ${ d }: ${ n } call(s)` );
	}
	console.log( 'Strings under a different domain never translate. Confirm this is intentional.' );
}

if ( nonLiteral ) {
	console.log( `\n${ nonLiteral } call(s) had a non-literal text or domain argument and were skipped.` );
	console.log( "Variables and constants are invisible to every extractor, core's included." );
}
