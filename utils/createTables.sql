
create table users (username varchar(30) not null, password varchar(30) not null, primary key (username));

create table group_names (groupname varchar(30) not null, password varchar(30) not null, primary key (groupname));

create table group_members (id serial primary key not null, groupname varchar(30) not null, username varchar(30) not null,
                            foreign key (groupname) references group_names(groupname) on delete cascade,
                            foreign key (username) references users(username) on delete cascade);

create table results (result_id serial primary key not null, result_date varchar(30) not null, username varchar(30) not null, guess varchar(255) not null,
                      foreign key (username) references users(username) on delete cascade);
                         
                           















