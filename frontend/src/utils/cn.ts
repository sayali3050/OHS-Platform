import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const homePathFor = (role: string) => (role === "admin" ? "/app/admin" : role === "supervisor" ? "/app/supervisor" : "/app/worker");
