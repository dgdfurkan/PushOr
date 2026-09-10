export const MAX_MEDIA_BYTES=10*1024*1024;
export type ReminderMedia={id:string;name:string;type:string;size:number;url:string};
export type Reminder={id:string;title:string;description:string;due:number;mediaId:string|null;revision:number;media:ReminderMedia|null;status:string;delivered:number|null};
export type ReminderInput={id:string;title:string;description:string;due:number;mediaId:string|null;revision?:number};
export function mediaUrl(id:string){return '/api/reminder-media/'+id;}
