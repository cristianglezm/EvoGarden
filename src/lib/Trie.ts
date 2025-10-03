class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEndOfWord: boolean = false;
}

export class Trie {
  private root: TrieNode = new TrieNode();

  insert(word: string): void {
    let currentNode = this.root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char)!;
    }
    currentNode.isEndOfWord = true;
  }

  search(prefix: string): string[] {
    if (!prefix) {
        return [];
    }

    let currentNode = this.root;
    for (const char of prefix) {
      if (!currentNode.children.has(char)) {
        return [];
      }
      currentNode = currentNode.children.get(char)!;
    }
    return this._findAllWords(currentNode, prefix);
  }

  private _findAllWords(node: TrieNode, prefix: string): string[] {
    const words: string[] = [];
    if (node.isEndOfWord) {
      words.push(prefix);
    }
    for (const [char, childNode] of node.children.entries()) {
      words.push(...this._findAllWords(childNode, prefix + char));
    }
    return words;
  }
}
