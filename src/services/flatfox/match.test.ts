import { describe, it, expect } from 'vitest';
import type { FlatfoxListing } from '@/lib/channels/flatfox/client';
import {
  buildApartmentIndex,
  listingToApartmentNumber,
  matchApartmentId,
} from './match';

function listing(overrides: Partial<FlatfoxListing>): FlatfoxListing {
  return {
    pk: 1,
    street: 'Sonnentalstrasse 13',
    zipcode: 8600,
    city: 'Duebendorf',
    ref_property: null,
    ref_house: null,
    ref_object: null,
    rent_gross: null,
    surface_living: null,
    number_of_rooms: null,
    floor: null,
    short_title: null,
    public_address: 'Sonnentalstrasse 13, 8600 Duebendorf',
    status: 'active',
    ...overrides,
  };
}

describe('listingToApartmentNumber', () => {
  it('baut "Haus.Object" aus den Flatfox-Refs', () => {
    expect(listingToApartmentNumber(listing({ ref_house: 'C', ref_object: '0406' }))).toBe(
      'C.0406',
    );
  });

  it('liefert null wenn ref_house fehlt', () => {
    expect(listingToApartmentNumber(listing({ ref_house: null, ref_object: '0406' }))).toBeNull();
  });

  it('liefert null wenn ref_object fehlt', () => {
    expect(listingToApartmentNumber(listing({ ref_house: 'C', ref_object: null }))).toBeNull();
  });

  it('formatiert nicht (Caller ist fuer Padding zustaendig) — uebernimmt rohe Strings', () => {
    // Falls Flatfox ungewoehnliche Strings liefert, lassen wir sie durch.
    expect(listingToApartmentNumber(listing({ ref_house: 'E', ref_object: '999' }))).toBe(
      'E.999',
    );
  });
});

describe('matchApartmentId', () => {
  const apartments = [
    { id: 'uuid-c-406', number: 'C.0406' },
    { id: 'uuid-d-203', number: 'D.0203' },
    { id: 'uuid-e-801', number: 'E.0801' },
  ];

  it('matcht exakt', () => {
    expect(matchApartmentId('C.0406', apartments)).toBe('uuid-c-406');
  });

  it('matcht case-insensitive: c.0406 -> C.0406', () => {
    expect(matchApartmentId('c.0406', apartments)).toBe('uuid-c-406');
  });

  it('matcht case-insensitive umgekehrt: D.0203 wenn DB d.0203 hat', () => {
    const lower = [{ id: 'uuid', number: 'd.0203' }];
    expect(matchApartmentId('D.0203', lower)).toBe('uuid');
  });

  it('liefert null wenn keine Wohnung passt', () => {
    expect(matchApartmentId('Z.9999', apartments)).toBeNull();
  });

  it('matcht NICHT bei Substring (E.0801 darf nicht E.080 finden)', () => {
    expect(matchApartmentId('E.080', apartments)).toBeNull();
  });
});

describe('buildApartmentIndex', () => {
  it('erzeugt eine Map mit lowercase-Keys', () => {
    const idx = buildApartmentIndex([
      { id: 'a', number: 'C.0406' },
      { id: 'b', number: 'D.0203' },
    ]);
    expect(idx.get('c.0406')).toBe('a');
    expect(idx.get('d.0203')).toBe('b');
    expect(idx.get('C.0406')).toBeUndefined(); // Caller muss lowercased lookup machen
    expect(idx.size).toBe(2);
  });

  it('letzter Wert gewinnt bei Duplikaten (defensives Verhalten)', () => {
    const idx = buildApartmentIndex([
      { id: 'first', number: 'C.0406' },
      { id: 'second', number: 'c.0406' },
    ]);
    expect(idx.get('c.0406')).toBe('second');
  });
});
