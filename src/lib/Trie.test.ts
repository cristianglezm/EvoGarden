import { describe, it, expect, beforeEach } from 'vitest';
import { Trie } from './Trie';

describe('Trie', () => {
  let trie: Trie;

  beforeEach(() => {
    trie = new Trie();
  });

  it('should insert and find a single word', () => {
    trie.insert('hello');
    expect(trie.search('he')).toEqual(['hello']);
    expect(trie.search('hello')).toEqual(['hello']);
  });

  it('should return an empty array for a non-existent prefix', () => {
    trie.insert('hello');
    expect(trie.search('world')).toEqual([]);
  });

  it('should return an empty array for an empty prefix', () => {
    trie.insert('hello');
    expect(trie.search('')).toEqual([]);
  });

  it('should handle multiple words with a common prefix', () => {
    const words = ['apple', 'apply', 'application', 'approval'];
    words.forEach(word => trie.insert(word));
    const results = trie.search('app').sort();
    expect(results).toEqual(['apple', 'application', 'apply', 'approval'].sort());
  });

  it('should return only the words that match the full prefix', () => {
    const words = ['apple', 'apply', 'application'];
    words.forEach(word => trie.insert(word));
    expect(trie.search('appl').sort()).toEqual(['apple', 'application', 'apply'].sort());
  });

  it('should handle words that are prefixes of other words', () => {
    trie.insert('run');
    trie.insert('runner');
    const results = trie.search('run').sort();
    expect(results).toEqual(['run', 'runner'].sort());
  });

  it('should be case-sensitive', () => {
    trie.insert('Hello');
    expect(trie.search('he')).toEqual([]);
    expect(trie.search('He')).toEqual(['Hello']);
  });

  it('should handle complex datasets', () => {
    const words = ['flower-abc-123', 'flower-abd-456', 'insect-abc-789', 'flower-xyz-101'];
    words.forEach(word => trie.insert(word));
    expect(trie.search('flower-ab').sort()).toEqual(['flower-abc-123', 'flower-abd-456'].sort());
    expect(trie.search('insect')).toEqual(['insect-abc-789']);
    expect(trie.search('flower-xyz')).toEqual(['flower-xyz-101']);
    expect(trie.search('bird')).toEqual([]);
  });
});
