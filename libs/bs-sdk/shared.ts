"use client";
import {
  FieldType,
  type IFieldMeta,
  type IOpenAttachment,
  type IRecord,
} from "@lark-base-open/js-sdk";
import { format } from "date-fns";
import { useEffect, useState } from "react";

export async function fileToIOpenAttachment(
  base: any,
  file: File
): Promise<IOpenAttachment> {
  const tokens = await base.batchUploadFile([file]);
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    token: tokens[0],
    timeStamp: file.lastModified,
  };
}
// function downloadFile(file: Blob | MediaSource) {
//   const downloadLink = document.createElement("a");
//   downloadLink.href = URL.createObjectURL(file);
//   downloadLink.download = file.name;
//   downloadLink.click();
// }
export function fileToURL(file: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}
export async function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  fileType = "image/png"
) {
  // 获取Canvas上的图像数据（这里假设图像数据为DataURL）
  // const imageDataURL = canvas.toDataURL(fileType);

  // // 将DataURL转换为Blob对象
  // const blob = dataURLToBlob(imageDataURL);

  const blob: Blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("canvas to blob error"));
        resolve(blob);
      },
      fileType,
      1
    );
  });

  // 创建File对象
  const file = new File([blob], fileName, { type: fileType });

  return file;
}
// 将DataURL转换为Blob对象的辅助函数
function dataURLToBlob(dataURL: string) {
  const byteString = atob(dataURL.split(",")[1]);
  const mimeString = dataURL.split(",")[0].split(":")[1].split(";")[0];
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([arrayBuffer], { type: mimeString });
}

export function base64ToFile(
  base64: string,
  filename: string,
  mimeType: string
) {
  const arr = base64.split(",");
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  // eslint-disable-next-line no-plusplus
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mimeType });
}
export function downloadFile(file: File) {
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(file);
  downloadLink.download = file.name;
  downloadLink.click();
}

export function urlToFile(url: string, filename: string, mimeType?: string) {
  return fetch(url)
    .then((res) => res.blob())
    .then(
      (blob) => new File([blob], filename, { type: mimeType ?? blob.type })
    );
}

export function fileExt(file: string, isDot = true) {
  const extIdx = file.lastIndexOf(".");
  const [name, ext] =
    extIdx === -1
      ? [file, undefined]
      : [file.slice(0, extIdx), file.slice(extIdx + 1)];
  return [name, ext ? (isDot ? "." : "") + ext.toLowerCase() : undefined];
}

export function smartFileSizeDisplay(b: number): string {
  const kb = b / 1024;
  if (kb < 1) {
    return b + "B";
  }
  const mb = kb / 1024;
  if (mb < 1) {
    return kb.toFixed(2) + "KB";
  }
  const gb = mb / 1024;
  if (gb < 1) {
    return mb.toFixed(2) + "MB";
  }
  return gb.toFixed(2) + "GB";
}

export function smartTimestampDisplay(timestamp: number): string {
  const date = new Date(timestamp);
  // const now = new Date();
  // const diff = now.getTime() - date.getTime();
  // if (diff < 1000) {
  //   return "刚刚";
  // }
  // if (diff < 60 * 1000) {
  //   return Math.floor(diff / 1000) + "秒前";
  // }
  // if (diff < 60 * 60 * 1000) {
  //   return Math.floor(diff / 1000 / 60) + "分钟前";
  // }
  // if (diff < 24 * 60 * 60 * 1000) {
  //   return Math.floor(diff / 1000 / 60 / 60) + "小时前";
  // }
  // if (diff < 7 * 24 * 60 * 60 * 1000) {
  //   return Math.floor(diff / 1000 / 60 / 60 / 24) + "天前";
  // }
  return date.toLocaleString();
}

export function copyText(url: string) {
  const input = document.createElement("input");
  input.value = url;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

export function splitFilename(url: string) {
  const idx = url.lastIndexOf("/");
  const idx2 = url.lastIndexOf("?");
  const name = url.slice(idx + 1, idx2 === -1 ? undefined : idx2);
  return name;
}

let isInit = new Map();
const initState = (key: string, state: any) => {
  if (isInit.has(key)) {
    return isInit.get(key);
  }
  const saved = localStorage.getItem(key);
  const init = saved ? JSON.parse(saved) : state;
  isInit.set(key, init);
  return init;
};

export function useKeepState<T>(state: T, id = "default") {
  const key = `keep-state-${id}`;
  const [data, setData] = useState(initState(key, state));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(data));
  }, [data, key]);

  return [data, setData] as const;
}

export function useDynKeep<T>(state: T) {
  const [data, setData] = useState(state);

  useEffect(() => {
    setData(state);
  }, [state]);

  const save = (id: string) => {
    localStorage.setItem(id, JSON.stringify(data));
  };

  const load = (id: string) => {
    const saved = localStorage.getItem(id);
    if (saved) {
      setData(JSON.parse(saved));
    }
  };

  return [data, setData, load, save] as const;
}

export function transDisplayRecord(fields: IFieldMeta[], record: IRecord) {
  const obj: any = {};

  fields.forEach((field) => {
    const cell = record.fields[field.id] as any;

    if (
      field.type === FieldType.DateTime &&
      "dateFormat" in field.property &&
      cell
    ) {
      obj[field.id] = format(cell, field.property?.dateFormat);
      obj["ts_" + field.name] = cell;
    } else if (field.type === FieldType.Url && cell) {
      obj[field.id] = cell[0]?.link;
    } else {
      // 确保数值类型保持正确的数值类型
      if (typeof cell === "number") {
        // 数值类型直接保存
        obj[field.id] = cell;
      } else if (typeof cell === "string") {
        // 字符串类型尝试转换为数值
        const numValue = parseFloat(cell);
        if (!isNaN(numValue)) {
          // 转换成功，保存为数值类型
          obj[field.id] = numValue;
        } else {
          // 转换失败，保存为原始字符串
          obj[field.id] = cell;
        }
      } else {
        // 其他类型按原有逻辑处理
        obj[field.id] = typeof cell === "object"
          ? cell?.text ??
            cell
              ?.map?.((item: any) => item?.text ?? item?.name)
              .filter((item: any) => item)
              .join(",")
          : cell;
      }
    }
    obj._raw_ = record.fields;
  });
  return obj;
}

export function transFieldsMap(fields: IFieldMeta[]) {
  const fieldsMapName: any = {};
  const fieldsMapId: any = {};

  fields.forEach((item) => {
    fieldsMapId[item.id] = item.name;
    fieldsMapName[item.name] = item.id;
  });

  return {
    fieldsMapName,
    fieldsMapId,
  };
}
