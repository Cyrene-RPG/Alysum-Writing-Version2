export async function sendStaffEmailCode(client,email){
 if(!email)throw Error('Your staff account needs an email address to receive a code.');
 const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 if(error)throw error;
}
export async function verifyStaffEmailCode(client,email,code,expectedUser){
 if(!/^[0-9]{6}$/.test(code))throw Error('Enter the six-digit code from your email.');
 if(!email||!expectedUser)throw Error('Sign in with your staff account again.');
 const {data,error}=await client.auth.verifyOtp({email,token:code,type:'email'});
 if(error)throw error;
 if(data?.user?.id!==expectedUser){
 await client.auth.signOut({scope:'local'});
 throw Error('Please sign in with the same staff account.');
 }
 return data;
}
