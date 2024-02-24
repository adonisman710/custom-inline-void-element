import React, { useCallback, useMemo, useState, useEffect } from "react";
import isHotkey from "is-hotkey";
import {
  Slate,
  Editable,
  withReact,
  useSlate,
  useSelected,
  useFocused
} from "slate-react";
import { Editor, Transforms, createEditor, Node, Path } from "slate";
import { withHistory } from "slate-history";
import { Button, Icon, Toolbar } from "./components";

const zeroWidthChar = "\uFEFF";

const HOTKEYS = {
  "mod+b": "bold",
  "mod+i": "italic",
  "mod+u": "underline",
  "mod+`": "code"
};

const LIST_TYPES = ["numbered-list", "bulleted-list"];

const InlineVoid = ({ attributes, children, element }) => {
  const selected = useSelected();
  const focused = useFocused();
  return (
    <span
      {...attributes}
      contentEditable={false}
      style={{
        backgroundColor: "lightgrey",
        outline: `${selected && focused ? "2px solid purple" : "none"}`
      }}
      onClick={() =>
        console.log({
          location: "InlineVoid onClick",
          element
        })
      }
    >
      inline_void_text
      {children}
    </span>
  );
};

const withInlineVoid = (editor) => {
  const { isVoid, isInline, normalizeNode } = editor;

  editor.isVoid = (element) => {
    return element.type === "inlineVoid" ? true : isVoid(element);
  };

  editor.isInline = (element) => {
    return element.type === "inlineVoid" ? true : isInline(element);
  };

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    if (node.type === "inlineVoid") {
      const parentNode = Node.parent(editor, path);
      const isFirstChild = !Path.hasPrevious(path);
      const islastChild =
        path[path.length - 1] === parentNode.children.length - 1;

      // If the inlineVoid is at the end of a line, must get path after the inlineVoid
      // at which to insert a zero width character
      const nextPath = Path.next(path);

      let hasPreviousAdjacentInlineVoid = false;
      if (!isFirstChild) {
        const prevSibling = Node.get(editor, Path.previous(path));
        hasPreviousAdjacentInlineVoid = prevSibling.type === "inlineVoid";
      }

      if (islastChild) {
        Transforms.insertNodes(
          editor,
          { text: zeroWidthChar },
          { at: nextPath }
        );
      }
      if (isFirstChild || hasPreviousAdjacentInlineVoid) {
        Transforms.insertNodes(editor, { text: zeroWidthChar }, { at: path });
      }
    }

    // Fall back to the original `normalizeNode` to enforce other constraints.
    normalizeNode(entry);
  };

  return editor;
};

const RichTextExample = () => {
  const [value, setValue] = useState(initialValue);
  const renderElement = useCallback((props) => <Element {...props} />, []);
  const renderLeaf = useCallback((props) => <Leaf {...props} />, []);
  const [isNormalized, setIsNormalized] = useState(false);
  const editor = useMemo(
    () => withInlineVoid(withHistory(withReact(createEditor()))),
    []
  );
  useEffect(() => {
    if (!isNormalized) {
      Editor.normalize(editor, { force: true });
      setIsNormalized(true);
    }
  });

  return (
    <Slate editor={editor} value={value} onChange={(value) => setValue(value)}>
      <Toolbar>
        <MarkButton format="bold" icon="format_bold" />
        <MarkButton format="italic" icon="format_italic" />
        <MarkButton format="underline" icon="format_underlined" />
        <MarkButton format="code" icon="code" />
        <BlockButton format="heading-one" icon="looks_one" />
        <BlockButton format="heading-two" icon="looks_two" />
        <BlockButton format="block-quote" icon="format_quote" />
        <BlockButton format="numbered-list" icon="format_list_numbered" />
        <BlockButton format="bulleted-list" icon="format_list_bulleted" />
      </Toolbar>
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        placeholder="Enter some rich text…"
        spellCheck
        autoFocus
        onKeyDown={(event) => {
          for (const hotkey in HOTKEYS) {
            if (isHotkey(hotkey, event)) {
              event.preventDefault();
              const mark = HOTKEYS[hotkey];
              toggleMark(editor, mark);
            }
          }
        }}
      />
    </Slate>
  );
};

const toggleBlock = (editor, format) => {
  const isActive = isBlockActive(editor, format);
  const isList = LIST_TYPES.includes(format);

  Transforms.unwrapNodes(editor, {
    match: (n) => LIST_TYPES.includes(n.type),
    split: true
  });

  Transforms.setNodes(editor, {
    type: isActive ? "paragraph" : isList ? "list-item" : format
  });

  if (!isActive && isList) {
    const block = { type: format, children: [] };
    Transforms.wrapNodes(editor, block);
  }
};

const toggleMark = (editor, format) => {
  const isActive = isMarkActive(editor, format);

  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

const isBlockActive = (editor, format) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === format
  });

  return !!match;
};

const isMarkActive = (editor, format) => {
  const marks = Editor.marks(editor);
  return marks ? marks[format] === true : false;
};

const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case "inlineVoid":
      return (
        <InlineVoid
          attributes={attributes}
          children={children}
          element={element}
        />
      );
    case "block-quote":
      return <blockquote {...attributes}>{children}</blockquote>;
    case "bulleted-list":
      return <ul {...attributes}>{children}</ul>;
    case "heading-one":
      return <h1 {...attributes}>{children}</h1>;
    case "heading-two":
      return <h2 {...attributes}>{children}</h2>;
    case "list-item":
      return <li {...attributes}>{children}</li>;
    case "numbered-list":
      return <ol {...attributes}>{children}</ol>;
    case "paragraph":
    default:
      return <p {...attributes}>{children}</p>;
  }
};

const Leaf = ({ attributes, children, leaf }) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }

  if (leaf.code) {
    children = <code>{children}</code>;
  }

  if (leaf.italic) {
    children = <em>{children}</em>;
  }

  if (leaf.underline) {
    children = <u>{children}</u>;
  }

  return <span {...attributes}>{children}</span>;
};

const BlockButton = ({ format, icon }) => {
  const editor = useSlate();
  return (
    <Button
      active={isBlockActive(editor, format)}
      onMouseDown={(event) => {
        event.preventDefault();
        toggleBlock(editor, format);
      }}
    >
      <Icon>{icon}</Icon>
    </Button>
  );
};

const MarkButton = ({ format, icon }) => {
  const editor = useSlate();
  return (
    <Button
      active={isMarkActive(editor, format)}
      onMouseDown={(event) => {
        event.preventDefault();
        toggleMark(editor, format);
      }}
    >
      <Icon>{icon}</Icon>
    </Button>
  );
};

const initialValue = [
  {
    type: "paragraph",
    children: [
      { text: "Some text " },
      { type: "inlineVoid", children: [{ text: "" }] },
      { text: " more text " },
      { type: "inlineVoid", children: [{ text: "" }] }
    ]
  },
  {
    type: "paragraph",
    children: [
      { text: "Some text " },
      { type: "inlineVoid", children: [{ text: "" }] },
      { text: " more text " },
      { type: "inlineVoid", children: [{ text: "" }] }
    ]
  }
];

export default RichTextExample;
