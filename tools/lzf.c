#include <stdint.h>
#include <string.h>
int lzf_dec(const uint8_t*in,int il,uint8_t*out,int ol){const uint8_t*ip=in,*ie=in+il;uint8_t*op=out,*oe=out+ol;
while(ip<ie){unsigned c=*ip++;if(c<32){c++;if(op+c>oe||ip+c>ie)return -1;memcpy(op,ip,c);op+=c;ip+=c;}
else{unsigned l=c>>5;int o=((c&31)<<8);if(l==7){l+=*ip++;}o+=*ip++;l+=2;uint8_t*r=op-o-1;if(r<out||op+l>oe)return -1;while(l--)*op++=*r++;}}
return (int)(op-out);}
