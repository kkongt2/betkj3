// Deterministic candidate search. Finalists are re-evaluated by the site's JS engine.
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iostream>
#include <numeric>
#include <random>
#include <set>
#include <vector>
#include <omp.h>
using W=std::array<int,17>;
struct Race{int date,n,k;int number[20];double odds[20],prob[20],f[20][17],q[20][20],paid[20][20];};
struct Result{W w;int mode,lo,hi,n,hits;double paid;double value()const{return n?paid/n:0;}};
std::vector<Race> races;
std::vector<Result> evaluate(W w,bool existing=false){
 double paid[2][21][21]={};int count[2][21][21]={},hits[2][21][21]={};
 for(const auto&r:races){
  double score[20];int rank[20],active=0;double sum=std::accumulate(w.begin(),w.end(),0.0),mean=0;
  for(int i=0;i<r.n;i++){if(r.odds[i]>=1)rank[active++]=i;score[i]=0;for(int j=0;j<17;j++)score[i]+=r.f[i][j]*w[j]/sum;score[i]*=6.28;mean+=score[i];}
  mean/=r.n;for(int i=0;i<r.n;i++)score[i]=existing?r.prob[i]:std::exp(std::max(-4.0,std::min(4.0,(score[i]-mean)*.6)));
  auto better=[&](int a,int b){return b<0||score[a]>score[b]||(score[a]==score[b]&&r.number[a]<r.number[b]);};
  std::sort(rank,rank+active,[&](int a,int b){return r.odds[a]!=r.odds[b]?r.odds[a]<r.odds[b]:better(a,b);});
  int analysis=rank[0];for(int j=1;j<active;j++){int i=rank[j];if(better(i,analysis))analysis=i;}
  for(int mode=0;mode<2;mode++){
   int anchor=mode?analysis:rank[0];
   for(int lo=2;lo<=active;lo++){int partner=-1;
    for(int hi=lo;hi<=20;hi++){
     if(hi<=active){int c=rank[hi-1];if(c!=anchor&&(partner<0||(existing?(r.q[anchor][c]>r.q[anchor][partner]||(r.q[anchor][c]==r.q[anchor][partner]&&better(c,partner))):better(c,partner))))partner=c;}
     if(partner>=0){count[mode][lo][hi]++;paid[mode][lo][hi]+=r.paid[anchor][partner];hits[mode][lo][hi]+=r.paid[anchor][partner]>0;}
    }
   }
  }
 }
 std::vector<Result> out;for(int m=0;m<2;m++)for(int l=2;l<=20;l++)for(int h=l;h<=20;h++)if(count[m][l][h])out.push_back({w,m,l,h,count[m][l][h],hits[m][l][h],paid[m][l][h]});return out;
}
int main(int argc,char**argv){
 std::ifstream in(argv[1]);int n,totalRaces;in>>n>>totalRaces;races.resize(n);for(auto&r:races){in>>r.date>>r.n>>r.k;for(int i=0;i<r.n;i++){in>>r.number[i]>>r.odds[i]>>r.prob[i];for(double&x:r.f[i])in>>x;}for(int i=0;i<r.n;i++)for(int j=0;j<r.n;j++)in>>r.q[i][j]>>r.paid[i][j];}if(!in)return 2;


 const int minimumEvaluated=int(std::ceil(totalRaces*.4));
 std::ifstream seed(argv[3]);int mode,baseMin,baseMax;W origin;seed>>mode>>baseMin>>baseMax;for(int&i:origin)seed>>i;if(!seed)return 3;
 auto distance=[](const W&a,const W&b){int n=0;for(int i=0;i<17;i++)n+=std::abs(a[i]-b[i]);return n;};
 auto valid=[&](const W&w){return distance(w,origin)<=60&&std::accumulate(w.begin(),w.end(),0)==100&&std::all_of(w.begin(),w.end(),[](int x){return x>=0&&x<=100;});};
 std::mt19937 rng(20260915+baseMax*17+mode);std::set<W> seen;std::vector<Result> board;int tested=0;
 auto batch=[&](const std::vector<W>& ws){for(const auto&w:ws){if(!valid(w)||!seen.insert(w).second)continue;tested++;auto scores=evaluate(w);
 for(auto&r:scores)if(r.n>=minimumEvaluated&&r.hits*20>=r.n*3&&r.mode==mode&&std::abs(r.lo-baseMin)<=3&&std::abs(r.hi-baseMax)<=3)board.push_back(r);
 std::sort(board.begin(),board.end(),[](const Result&a,const Result&b){if(a.value()!=b.value())return a.value()>b.value();if(a.n!=b.n)return a.n>b.n;if(a.w!=b.w)return a.w<b.w;if(a.lo!=b.lo)return a.lo<b.lo;return a.hi<b.hi;});
 std::vector<Result> keep;for(const auto&r:board)if(std::all_of(keep.begin(),keep.end(),[&](const Result&x){return distance(x.w,r.w)>=6;})){keep.push_back(r);if(keep.size()==24)break;}board.swap(keep);
 }};
 std::vector<W> initial={origin};
 for(int a=0;a<17;a++)for(int b=0;b<17;b++)for(int shift:{1,5,10,20,30})if(a!=b&&origin[a]>=shift){W w=origin;w[a]-=shift;w[b]+=shift;initial.push_back(w);}
 for(int trial=0;trial<1800;trial++){W w=origin;int steps=1+rng()%30;while(steps--){int a=rng()%17,b=rng()%17;while(!w[a])a=rng()%17;if(a!=b){w[a]--;w[b]++;}}initial.push_back(w);}
 batch(initial);if(board.empty())return 4;
 for(int round=0;round<2;round++)for(int step:{5,1}){std::vector<W> next;auto top=board;for(int t=0;t<std::min(6,int(top.size()));t++)for(int a=0;a<17;a++)for(int b=0;b<17;b++)if(a!=b&&top[t].w[a]>=step){W w=top[t].w;w[a]-=step;w[b]+=step;next.push_back(w);}batch(next);}
 std::ofstream out(argv[2]);out<<"{\"weightCandidates\":"<<tested<<",\"finalists\":[";bool first=true;for(const auto&r:board){if(!first)out<<',';first=false;out<<"{\"weights\":[";for(int i=0;i<17;i++){if(i)out<<',';out<<r.w[i];}out<<"]}";}out<<"]}";
}
