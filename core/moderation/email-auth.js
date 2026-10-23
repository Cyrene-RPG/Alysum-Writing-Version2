export async function sendStaffEmailCode(client,email){
 if(!email)throw Error('Your staff account needs an email address to receive a code.');
 const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 if(error)throw error;
}
export async function verifyStaffEmailCode(client,email,code,expectedUser){
 if(!/^[0-9]{6,10}$/.test(code))throw Error('Enter the complete numeric code from your email (6–10 digits).');
 if(!email||!expectedUser)throw Error('Sign in with your staff account again.');
 const {data,error}=await client.auth.verifyOtp({email,token:code,type:'email'});
 if(error)throw error;
 if(data?.user?.id!==expectedUser){
 await client.auth.signOut({scope:'local'});
 throw Error('Please sign in with the same staff account.');
 }
 return data;
}

export function emailCodeRetrySeconds(error){
 const match=String(error?.message||'').match(/after\s+(\d+)\s+seconds?/i);
 if(match)return Math.min(3600,Math.max(1,Number(match[1])));
 return error?.status===429||error?.code==='over_email_send_rate_limit'?60:0;
}
