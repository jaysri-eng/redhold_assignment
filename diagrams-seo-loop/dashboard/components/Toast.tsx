"use client";

interface Props {
  msg:  string;
  type: "success" | "error";
}

export default function Toast({ msg, type }: Props) {
  return (
    <div className={`toast toast-${type}`}>
      {msg}
    </div>
  );
}
